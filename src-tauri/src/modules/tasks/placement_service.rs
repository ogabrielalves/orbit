use rusqlite::Connection;

use super::models::Task;
use super::repository::{self, ColumnInfo, TaskSlot};
use super::service::{end_position, find_existing, record};
use crate::error::{AppError, AppResult};
use crate::modules::activity::models::{ActivityAction, ChangeSet};
use crate::modules::boards::models::ColumnKind;
use crate::shared::position::{self, Slot};
use crate::shared::time;
use crate::state::AppState;

pub fn move_task(
    state: &AppState,
    id: &str,
    column_id: &str,
    after_task_id: Option<String>,
) -> AppResult<Task> {
    let mut connection = state.database();
    let transaction = connection.transaction()?;
    let task = find_movable(&transaction, id)?;
    let target = find_column(&transaction, column_id)?;
    let is_foreign_column = target.project_id != task.project_id;
    if is_foreign_column {
        return Err(AppError::InvalidMove);
    }

    let slots = repository::list_column_slots(&transaction, &target.id)?;
    let ordered = to_slots(&slots);
    let is_same_column = task.column_id.as_deref() == Some(target.id.as_str());
    let is_already_there =
        is_same_column && position::previous_sibling_id(&ordered, id) == after_task_id.as_deref();
    if is_already_there {
        return Ok(task);
    }

    let siblings: Vec<Slot<'_>> = ordered
        .iter()
        .filter(|slot| slot.id != id)
        .copied()
        .collect();
    let new_position = position::place_after(&siblings, after_task_id.as_deref())?;
    let origin = describe_origin(&transaction, &task)?;
    let now = time::now();
    let completed_at = if is_same_column {
        task.completed_at.clone()
    } else {
        completion_after_move(
            &origin,
            Some(target.kind),
            task.completed_at.as_deref(),
            &now,
        )
    };
    repository::set_placement(
        &transaction,
        id,
        Some(&target.board_id),
        Some(&target.id),
        &new_position,
        completed_at.as_deref(),
        &now,
    )?;

    if !is_same_column {
        let mut changes = ChangeSet::new();
        track_placement(&mut changes, &origin, Some(&target));
        record(&transaction, id, ActivityAction::Moved, changes)?;
    }
    let moved = find_existing(&transaction, id)?;
    transaction.commit()?;
    Ok(moved)
}

pub fn send_to_board(
    state: &AppState,
    id: &str,
    board_id: &str,
    column_id: Option<String>,
) -> AppResult<Task> {
    let mut connection = state.database();
    let transaction = connection.transaction()?;
    let task = find_movable(&transaction, id)?;

    let is_already_on_a_board = task.board_id.is_some();
    if is_already_on_a_board {
        return Err(AppError::Conflict(
            "task is already on a board; move it between columns instead".into(),
        ));
    }

    let board_project_id = repository::find_board_project_id(&transaction, board_id)?
        .ok_or_else(|| AppError::NotFound("board".into()))?;
    let is_foreign_board = board_project_id != task.project_id;
    if is_foreign_board {
        return Err(AppError::InvalidMove);
    }

    let target = match column_id {
        Some(column_id) => {
            let column = find_column(&transaction, &column_id)?;
            let belongs_elsewhere = column.board_id != board_id;
            if belongs_elsewhere {
                return Err(AppError::InvalidMove);
            }
            column
        }
        None => repository::find_first_column_info(&transaction, board_id)?
            .ok_or_else(|| AppError::Validation("board has no columns".into()))?,
    };

    let slots = repository::list_column_slots(&transaction, &target.id)?;
    let new_position = end_position(&slots)?;
    let now = time::now();
    let completed_at = completion_after_move(&Origin::Backlog, Some(target.kind), None, &now);
    repository::set_placement(
        &transaction,
        id,
        Some(&target.board_id),
        Some(&target.id),
        &new_position,
        completed_at.as_deref(),
        &now,
    )?;
    let mut changes = ChangeSet::new();
    track_placement(&mut changes, &Origin::Backlog, Some(&target));
    record(&transaction, id, ActivityAction::Moved, changes)?;
    let moved = find_existing(&transaction, id)?;
    transaction.commit()?;
    Ok(moved)
}

pub fn send_to_backlog(state: &AppState, id: &str) -> AppResult<Task> {
    let mut connection = state.database();
    let transaction = connection.transaction()?;
    let task = find_movable(&transaction, id)?;

    let is_already_in_backlog = task.board_id.is_none();
    if is_already_in_backlog {
        return Ok(task);
    }

    let origin = describe_origin(&transaction, &task)?;
    let slots = repository::list_backlog_slots(&transaction, &task.project_id)?;
    let new_position = end_position(&slots)?;
    repository::set_placement(
        &transaction,
        id,
        None,
        None,
        &new_position,
        None,
        &time::now(),
    )?;
    let mut changes = ChangeSet::new();
    track_placement(&mut changes, &origin, None);
    record(&transaction, id, ActivityAction::Moved, changes)?;
    let moved = find_existing(&transaction, id)?;
    transaction.commit()?;
    Ok(moved)
}

enum Origin {
    Backlog,
    Column {
        board: String,
        column: String,
        kind: ColumnKind,
    },
}

/// `completed_at` after a task changes column: entering a `done` column stamps `now`,
/// moving between `done` columns keeps the original stamp, and anywhere else clears it.
fn completion_after_move(
    origin: &Origin,
    target_kind: Option<ColumnKind>,
    current: Option<&str>,
    now: &str,
) -> Option<String> {
    let enters_done = target_kind == Some(ColumnKind::Done);
    if !enters_done {
        return None;
    }
    let was_done = matches!(
        origin,
        Origin::Column {
            kind: ColumnKind::Done,
            ..
        }
    );
    match (was_done, current) {
        (true, Some(stamp)) => Some(stamp.to_string()),
        _ => Some(now.to_string()),
    }
}

fn find_movable(connection: &Connection, id: &str) -> AppResult<Task> {
    let task = find_existing(connection, id)?;

    let is_archived = task.archived_at.is_some();
    if is_archived {
        return Err(AppError::Conflict(
            "archived tasks cannot be moved; restore the task first".into(),
        ));
    }
    let is_subtask = task.parent_task_id.is_some();
    if is_subtask {
        return Err(AppError::Validation(
            "subtasks cannot be placed on a board or in the backlog".into(),
        ));
    }
    Ok(task)
}

fn find_column(connection: &Connection, column_id: &str) -> AppResult<ColumnInfo> {
    repository::find_column_info(connection, column_id)?
        .ok_or_else(|| AppError::NotFound("column".into()))
}

fn describe_origin(connection: &Connection, task: &Task) -> AppResult<Origin> {
    let Some(column_id) = &task.column_id else {
        return Ok(Origin::Backlog);
    };
    let column = find_column(connection, column_id)?;
    Ok(Origin::Column {
        board: column.board_name,
        column: column.name,
        kind: column.kind,
    })
}

fn track_placement(changes: &mut ChangeSet, origin: &Origin, destination: Option<&ColumnInfo>) {
    let (from_board, from_column) = match origin {
        Origin::Backlog => (None, None),
        Origin::Column { board, column, .. } => (Some(board.as_str()), Some(column.as_str())),
    };
    let to_board = destination.map(|column| column.board_name.as_str());
    let to_column = destination.map(|column| column.name.as_str());
    changes.track("board", from_board, to_board);
    changes.track("column", from_column, to_column);
}

fn to_slots(slots: &[TaskSlot]) -> Vec<Slot<'_>> {
    slots
        .iter()
        .map(|slot| Slot {
            id: slot.id.as_str(),
            position: slot.position.as_str(),
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{connection::open_in_memory, migrations};
    use crate::modules::activity::models::{ActivityEntry, EntityType};
    use crate::modules::activity::service as activity;
    use crate::modules::boards::models::{BoardDetails, ColumnKind, CreateBoardInput, NewColumn};
    use crate::modules::boards::service as boards;
    use crate::modules::tasks::models::{CreateTaskInput, UpdateTaskInput};
    use crate::modules::tasks::service as tasks;

    const NOW: &str = "2026-11-08T10:00:00.000Z";

    /// Test convention: "Todo" is a todo stage, "Done" is the done stage, anything else is in progress.
    fn kind_of(name: &str) -> ColumnKind {
        match name {
            "Todo" => ColumnKind::Todo,
            "Done" => ColumnKind::Done,
            _ => ColumnKind::InProgress,
        }
    }

    fn named_columns(names: &[&str]) -> Vec<NewColumn> {
        names
            .iter()
            .map(|name| NewColumn::new(name, kind_of(name)))
            .collect()
    }

    fn state() -> AppState {
        let mut connection = open_in_memory().expect("opens");
        migrations::run(&mut connection).expect("migrates");
        for id in ["p1", "p2"] {
            connection
                .execute(
                    "INSERT INTO projects (id, name, created_at, updated_at) VALUES (?1, ?1, ?2, ?2)",
                    (id, NOW),
                )
                .expect("project");
        }
        AppState::new(connection, None)
    }

    fn board(state: &AppState, project_id: &str, name: &str, columns: &[&str]) -> BoardDetails {
        boards::create(
            state,
            CreateBoardInput {
                project_id: project_id.into(),
                name: name.into(),
                columns: Some(named_columns(columns)),
            },
        )
        .expect("creates board")
    }

    fn backlog_task(state: &AppState, project_id: &str, title: &str) -> Task {
        tasks::create(
            state,
            CreateTaskInput {
                project_id: project_id.into(),
                title: title.into(),
                description: None,
                priority: None,
                due_date: None,
                column_id: None,
            },
        )
        .expect("creates")
    }

    fn column_task(state: &AppState, project_id: &str, column_id: &str, title: &str) -> Task {
        tasks::create(
            state,
            CreateTaskInput {
                project_id: project_id.into(),
                title: title.into(),
                description: None,
                priority: None,
                due_date: None,
                column_id: Some(column_id.into()),
            },
        )
        .expect("creates")
    }

    fn titles_in_column(state: &AppState, board_id: &str, column_id: &str) -> Vec<String> {
        tasks::list_by_board(state, board_id)
            .expect("lists")
            .into_iter()
            .filter(|task| task.column_id.as_deref() == Some(column_id))
            .map(|task| task.title)
            .collect()
    }

    fn task_entries(state: &AppState) -> Vec<ActivityEntry> {
        let mut all = activity::recent(state, Some(100)).expect("reads activity");
        all.reverse();
        all.into_iter()
            .filter(|entry| entry.entity_type == EntityType::Task)
            .collect()
    }

    fn actions(state: &AppState) -> Vec<ActivityAction> {
        task_entries(state)
            .iter()
            .map(|entry| entry.action)
            .collect()
    }

    #[test]
    fn move_to_the_first_position_of_the_same_column() {
        let state = state();
        let details = board(&state, "p1", "B", &["Todo"]);
        let column = details.columns[0].id.clone();
        column_task(&state, "p1", &column, "A");
        column_task(&state, "p1", &column, "B");
        let third = column_task(&state, "p1", &column, "C");

        move_task(&state, &third.id, &column, None).expect("moves");

        assert_eq!(
            titles_in_column(&state, &details.board.id, &column),
            ["C", "A", "B"]
        );
    }

    #[test]
    fn move_after_a_sibling_in_the_middle_and_at_the_end() {
        let state = state();
        let details = board(&state, "p1", "B", &["Todo"]);
        let column = details.columns[0].id.clone();
        let a = column_task(&state, "p1", &column, "A");
        let b = column_task(&state, "p1", &column, "B");
        let c = column_task(&state, "p1", &column, "C");
        let d = column_task(&state, "p1", &column, "D");

        move_task(&state, &d.id, &column, Some(a.id.clone())).expect("moves D after A");
        let after_middle = titles_in_column(&state, &details.board.id, &column);
        move_task(&state, &a.id, &column, Some(c.id.clone())).expect("moves A after C");
        let after_end = titles_in_column(&state, &details.board.id, &column);

        assert_eq!(after_middle, ["A", "D", "B", "C"]);
        assert_eq!(after_end, ["D", "B", "C", "A"]);
        let _ = b;
    }

    #[test]
    fn move_across_columns_updates_column_and_position_and_leaves_other_tasks_alone() {
        let state = state();
        let details = board(&state, "p1", "B", &["Todo", "Done"]);
        let todo = details.columns[0].id.clone();
        let done = details.columns[1].id.clone();
        let moving = column_task(&state, "p1", &todo, "Moving");
        let staying = column_task(&state, "p1", &todo, "Staying");
        let resident = column_task(&state, "p1", &done, "Resident");

        let moved = move_task(&state, &moving.id, &done, Some(resident.id.clone())).expect("moves");

        assert_eq!(moved.column_id.as_deref(), Some(done.as_str()));
        assert_eq!(moved.board_id.as_deref(), Some(details.board.id.as_str()));
        assert_eq!(
            titles_in_column(&state, &details.board.id, &todo),
            ["Staying"]
        );
        assert_eq!(
            titles_in_column(&state, &details.board.id, &done),
            ["Resident", "Moving"]
        );
        assert_eq!(tasks::get(&state, &staying.id).expect("reads"), staying);
        assert_eq!(tasks::get(&state, &resident.id).expect("reads"), resident);
    }

    #[test]
    fn move_into_an_empty_column() {
        let state = state();
        let details = board(&state, "p1", "B", &["Todo", "Done"]);
        let task = column_task(&state, "p1", &details.columns[0].id, "T");

        let moved = move_task(&state, &task.id, &details.columns[1].id, None).expect("moves");

        assert_eq!(
            moved.column_id.as_deref(),
            Some(details.columns[1].id.as_str())
        );
    }

    #[test]
    fn move_to_a_column_of_another_board_of_the_same_project_changes_the_board_too() {
        let state = state();
        let first = board(&state, "p1", "First", &["Todo"]);
        let second = board(&state, "p1", "Second", &["Doing"]);
        let task = column_task(&state, "p1", &first.columns[0].id, "T");

        let moved = move_task(&state, &task.id, &second.columns[0].id, None).expect("moves");

        assert_eq!(moved.board_id.as_deref(), Some(second.board.id.as_str()));
        assert_eq!(
            moved.column_id.as_deref(),
            Some(second.columns[0].id.as_str())
        );
    }

    #[test]
    fn move_from_the_backlog_into_a_column_also_works() {
        let state = state();
        let details = board(&state, "p1", "B", &["Todo"]);
        let idea = backlog_task(&state, "p1", "Idea");

        let moved = move_task(&state, &idea.id, &details.columns[0].id, None).expect("moves");

        assert_eq!(moved.board_id.as_deref(), Some(details.board.id.as_str()));
    }

    #[test]
    fn move_to_where_it_already_is_changes_and_logs_nothing() {
        let state = state();
        let details = board(&state, "p1", "B", &["Todo"]);
        let column = details.columns[0].id.clone();
        let a = column_task(&state, "p1", &column, "A");
        let b = column_task(&state, "p1", &column, "B");

        let first_stays = move_task(&state, &a.id, &column, None).expect("moves");
        let second_stays = move_task(&state, &b.id, &column, Some(a.id.clone())).expect("moves");

        assert_eq!(first_stays, a);
        assert_eq!(second_stays, b);
        assert_eq!(
            actions(&state),
            [ActivityAction::Created, ActivityAction::Created]
        );
    }

    #[test]
    fn reordering_inside_a_column_is_not_logged_but_changing_column_is() {
        let state = state();
        let details = board(&state, "p1", "Sprint", &["Todo", "Done"]);
        let todo = details.columns[0].id.clone();
        let done = details.columns[1].id.clone();
        let a = column_task(&state, "p1", &todo, "A");
        column_task(&state, "p1", &todo, "B");

        move_task(
            &state,
            &a.id,
            &todo,
            Some(
                tasks::list_by_board(&state, &details.board.id).expect("lists")[1]
                    .id
                    .clone(),
            ),
        )
        .expect("reorders");
        move_task(&state, &a.id, &done, None).expect("changes column");

        let moves: Vec<ActivityEntry> = task_entries(&state)
            .into_iter()
            .filter(|entry| entry.action == ActivityAction::Moved)
            .collect();
        assert_eq!(moves.len(), 1);
        let changes = moves[0].changes.as_ref().expect("has changes");
        assert_eq!(changes["column"].from.as_deref(), Some("Todo"));
        assert_eq!(changes["column"].to.as_deref(), Some("Done"));
        assert!(!changes.contains_key("board"));
    }

    #[test]
    fn moving_to_another_board_logs_both_board_and_column_names() {
        let state = state();
        let first = board(&state, "p1", "First", &["Todo"]);
        let second = board(&state, "p1", "Second", &["Doing"]);
        let task = column_task(&state, "p1", &first.columns[0].id, "T");

        move_task(&state, &task.id, &second.columns[0].id, None).expect("moves");

        let logged = task_entries(&state);
        let changes = logged[1].changes.as_ref().expect("has changes");
        assert_eq!(changes["board"].from.as_deref(), Some("First"));
        assert_eq!(changes["board"].to.as_deref(), Some("Second"));
        assert_eq!(changes["column"].from.as_deref(), Some("Todo"));
        assert_eq!(changes["column"].to.as_deref(), Some("Doing"));
    }

    #[test]
    fn move_rejects_invalid_targets_without_changing_anything() {
        let state = state();
        let details = board(&state, "p1", "B", &["Todo", "Done"]);
        let other_project = board(&state, "p2", "X", &["Todo"]);
        let todo = details.columns[0].id.clone();
        let done = details.columns[1].id.clone();
        let task = column_task(&state, "p1", &todo, "T");
        let sibling_elsewhere = column_task(&state, "p1", &done, "Elsewhere");

        let to_foreign = move_task(&state, &task.id, &other_project.columns[0].id, None);
        let to_unknown = move_task(&state, &task.id, "missing", None);
        let after_itself = move_task(&state, &task.id, &todo, Some(task.id.clone()));
        let after_unknown = move_task(&state, &task.id, &todo, Some("missing".into()));
        let after_task_of_other_column =
            move_task(&state, &task.id, &todo, Some(sibling_elsewhere.id.clone()));
        let unknown_task = move_task(&state, "missing", &todo, None);

        assert!(matches!(to_foreign, Err(AppError::InvalidMove)));
        assert!(matches!(to_unknown, Err(AppError::NotFound(_))));
        assert!(matches!(after_itself, Err(AppError::InvalidMove)));
        assert!(matches!(after_unknown, Err(AppError::InvalidMove)));
        assert!(matches!(
            after_task_of_other_column,
            Err(AppError::InvalidMove)
        ));
        assert!(matches!(unknown_task, Err(AppError::NotFound(_))));
        assert_eq!(tasks::get(&state, &task.id).expect("reads"), task);
    }

    #[test]
    fn archived_tasks_and_subtasks_cannot_be_moved() {
        let state = state();
        let details = board(&state, "p1", "B", &["Todo", "Done"]);
        let parent = column_task(&state, "p1", &details.columns[0].id, "Parent");
        let archived = column_task(&state, "p1", &details.columns[0].id, "Archived");
        tasks::archive(&state, &archived.id).expect("archives");
        state
            .database()
            .execute(
                "INSERT INTO tasks (id, project_id, parent_task_id, title, position, created_at, updated_at) VALUES ('sub', 'p1', ?1, 'Sub', 'V', ?2, ?2)",
                (&parent.id, NOW),
            )
            .expect("subtask");

        let archived_result = move_task(&state, &archived.id, &details.columns[1].id, None);
        let subtask_result = move_task(&state, "sub", &details.columns[1].id, None);

        assert!(matches!(archived_result, Err(AppError::Conflict(_))));
        assert!(matches!(subtask_result, Err(AppError::Validation(_))));
    }

    #[test]
    fn archived_siblings_do_not_take_part_in_positioning() {
        let state = state();
        let details = board(&state, "p1", "B", &["Todo"]);
        let column = details.columns[0].id.clone();
        let hidden = column_task(&state, "p1", &column, "Hidden");
        column_task(&state, "p1", &column, "Visible");
        tasks::archive(&state, &hidden.id).expect("archives");
        let extra = column_task(&state, "p1", &column, "Extra");

        let to_archived_sibling = move_task(&state, &extra.id, &column, Some(hidden.id.clone()));
        move_task(&state, &extra.id, &column, None).expect("moves first");

        assert!(matches!(to_archived_sibling, Err(AppError::InvalidMove)));
        assert_eq!(
            titles_in_column(&state, &details.board.id, &column),
            ["Extra", "Visible"]
        );
    }

    #[test]
    fn many_random_moves_across_columns_match_a_plain_model() {
        let state = state();
        let details = board(&state, "p1", "B", &["One", "Two", "Three"]);
        let columns: Vec<String> = details
            .columns
            .iter()
            .map(|column| column.id.clone())
            .collect();
        let mut model: Vec<Vec<Task>> = vec![vec![], vec![], vec![]];
        for index in 0..9 {
            let slot = index % 3;
            let task = column_task(&state, "p1", &columns[slot], &format!("T{index}"));
            model[slot].push(task);
        }
        let mut seed: u64 = 99;
        let mut next_random = move |limit: usize| {
            seed = seed
                .wrapping_mul(6364136223846793005)
                .wrapping_add(1442695040888963407);
            ((seed >> 33) as usize) % limit
        };

        for _ in 0..200 {
            let source = loop {
                let candidate = next_random(3);
                if !model[candidate].is_empty() {
                    break candidate;
                }
            };
            let index = next_random(model[source].len());
            let moved = model[source].remove(index);
            let destination = next_random(3);
            let slot = next_random(model[destination].len() + 1);
            let after = slot
                .checked_sub(1)
                .map(|index| model[destination][index].id.clone());
            model[destination].insert(slot, moved.clone());
            move_task(&state, &moved.id, &columns[destination], after).expect("moves");
        }

        for (index, column) in columns.iter().enumerate() {
            let expected: Vec<String> =
                model[index].iter().map(|task| task.title.clone()).collect();
            assert_eq!(
                titles_in_column(&state, &details.board.id, column),
                expected
            );
        }
    }

    #[test]
    fn a_failing_activity_write_rolls_the_move_back() {
        let state = state();
        let details = board(&state, "p1", "B", &["Todo", "Done"]);
        let task = column_task(&state, "p1", &details.columns[0].id, "T");
        state
            .database()
            .execute_batch("DROP TABLE activity_log;")
            .expect("drops log table");

        let result = move_task(&state, &task.id, &details.columns[1].id, None);

        assert!(result.is_err());
        assert_eq!(tasks::get(&state, &task.id).expect("reads"), task);
    }

    #[test]
    fn send_to_board_puts_a_backlog_task_at_the_end_of_the_first_column_by_default() {
        let state = state();
        let details = board(&state, "p1", "B", &["Todo", "Done"]);
        let todo = details.columns[0].id.clone();
        column_task(&state, "p1", &todo, "Existing");
        let idea = backlog_task(&state, "p1", "Idea");

        let sent = send_to_board(&state, &idea.id, &details.board.id, None).expect("sends");

        assert_eq!(sent.board_id.as_deref(), Some(details.board.id.as_str()));
        assert_eq!(sent.column_id.as_deref(), Some(todo.as_str()));
        assert_eq!(
            titles_in_column(&state, &details.board.id, &todo),
            ["Existing", "Idea"]
        );
    }

    #[test]
    fn send_to_board_can_target_a_specific_column_and_keeps_all_task_data() {
        let state = state();
        let details = board(&state, "p1", "B", &["Todo", "Done"]);
        let done = details.columns[1].id.clone();
        let idea = tasks::create(
            &state,
            CreateTaskInput {
                project_id: "p1".into(),
                title: "Idea".into(),
                description: Some("details".into()),
                priority: Some(crate::modules::tasks::models::TaskPriority::High),
                due_date: Some("2026-12-24".into()),
                column_id: None,
            },
        )
        .expect("creates");

        let sent =
            send_to_board(&state, &idea.id, &details.board.id, Some(done.clone())).expect("sends");

        assert_eq!(sent.column_id.as_deref(), Some(done.as_str()));
        assert_eq!(sent.id, idea.id);
        assert_eq!(sent.title, idea.title);
        assert_eq!(sent.description, idea.description);
        assert_eq!(sent.priority, idea.priority);
        assert_eq!(sent.due_date, idea.due_date);
        assert_eq!(sent.created_at, idea.created_at);
    }

    #[test]
    fn send_to_board_validates_board_column_project_and_state() {
        let state = state();
        let details = board(&state, "p1", "B", &["Todo"]);
        let other_board = board(&state, "p1", "C", &["Other"]);
        let foreign = board(&state, "p2", "X", &["Todo"]);
        let empty = board(&state, "p1", "Empty", &[]);
        let idea = backlog_task(&state, "p1", "Idea");
        let placed = column_task(&state, "p1", &details.columns[0].id, "Placed");

        let unknown_board = send_to_board(&state, &idea.id, "missing", None);
        let foreign_board = send_to_board(&state, &idea.id, &foreign.board.id, None);
        let column_of_other_board = send_to_board(
            &state,
            &idea.id,
            &details.board.id,
            Some(other_board.columns[0].id.clone()),
        );
        let unknown_column =
            send_to_board(&state, &idea.id, &details.board.id, Some("missing".into()));
        let board_without_columns = send_to_board(&state, &idea.id, &empty.board.id, None);
        let already_on_board = send_to_board(&state, &placed.id, &details.board.id, None);
        let unknown_task = send_to_board(&state, "missing", &details.board.id, None);

        assert!(matches!(unknown_board, Err(AppError::NotFound(_))));
        assert!(matches!(foreign_board, Err(AppError::InvalidMove)));
        assert!(matches!(column_of_other_board, Err(AppError::InvalidMove)));
        assert!(matches!(unknown_column, Err(AppError::NotFound(_))));
        assert!(matches!(
            board_without_columns,
            Err(AppError::Validation(_))
        ));
        assert!(matches!(already_on_board, Err(AppError::Conflict(_))));
        assert!(matches!(unknown_task, Err(AppError::NotFound(_))));
        assert_eq!(tasks::get(&state, &idea.id).expect("reads"), idea);
    }

    #[test]
    fn send_to_board_logs_the_board_and_column_names() {
        let state = state();
        let details = board(&state, "p1", "Sprint", &["Todo"]);
        let idea = backlog_task(&state, "p1", "Idea");

        send_to_board(&state, &idea.id, &details.board.id, None).expect("sends");

        let logged = task_entries(&state);
        assert_eq!(logged[1].action, ActivityAction::Moved);
        let changes = logged[1].changes.as_ref().expect("has changes");
        assert_eq!(changes["board"].from, None);
        assert_eq!(changes["board"].to.as_deref(), Some("Sprint"));
        assert_eq!(changes["column"].to.as_deref(), Some("Todo"));
    }

    #[test]
    fn send_to_backlog_takes_the_task_off_the_board_and_appends_it_to_the_project_backlog() {
        let state = state();
        let details = board(&state, "p1", "Sprint", &["Todo"]);
        let existing = backlog_task(&state, "p1", "Existing");
        let placed = column_task(&state, "p1", &details.columns[0].id, "Placed");

        let returned = send_to_backlog(&state, &placed.id).expect("returns");

        assert_eq!(
            (returned.board_id.clone(), returned.column_id.clone()),
            (None, None)
        );
        assert!(returned.position > existing.position);
        assert_eq!(returned.title, placed.title);
        assert!(titles_in_column(&state, &details.board.id, &details.columns[0].id).is_empty());
    }

    #[test]
    fn send_to_backlog_is_idempotent_and_logs_only_the_real_move() {
        let state = state();
        let details = board(&state, "p1", "Sprint", &["Todo"]);
        let placed = column_task(&state, "p1", &details.columns[0].id, "Placed");

        send_to_backlog(&state, &placed.id).expect("returns");
        let again = send_to_backlog(&state, &placed.id).expect("returns again");

        assert_eq!(
            actions(&state),
            [ActivityAction::Created, ActivityAction::Moved]
        );
        let logged = task_entries(&state);
        let changes = logged[1].changes.as_ref().expect("has changes");
        assert_eq!(changes["board"].from.as_deref(), Some("Sprint"));
        assert_eq!(changes["board"].to, None);
        assert_eq!(changes["column"].from.as_deref(), Some("Todo"));
        assert!(again.board_id.is_none());
    }

    #[test]
    fn send_to_backlog_rejects_unknown_archived_and_subtask_tasks() {
        let state = state();
        let details = board(&state, "p1", "Sprint", &["Todo"]);
        let archived = column_task(&state, "p1", &details.columns[0].id, "Archived");
        tasks::archive(&state, &archived.id).expect("archives");

        assert!(matches!(
            send_to_backlog(&state, "missing"),
            Err(AppError::NotFound(_))
        ));
        assert!(matches!(
            send_to_backlog(&state, &archived.id),
            Err(AppError::Conflict(_))
        ));
    }

    #[test]
    fn a_task_can_make_the_round_trip_backlog_board_backlog() {
        let state = state();
        let details = board(&state, "p1", "Sprint", &["Todo"]);
        let idea = backlog_task(&state, "p1", "Idea");
        tasks::update(
            &state,
            &idea.id,
            UpdateTaskInput {
                description: Some("keep me".into()),
                ..Default::default()
            },
        )
        .expect("updates");

        send_to_board(&state, &idea.id, &details.board.id, None).expect("sends");
        let back = send_to_backlog(&state, &idea.id).expect("returns");

        assert_eq!(back.description, "keep me");
        assert_eq!((back.board_id, back.column_id), (None, None));
    }

    fn done_board(state: &AppState) -> BoardDetails {
        board(state, "p1", "B", &["Todo", "Doing", "Done", "Done"])
    }

    fn column_of(details: &BoardDetails, index: usize) -> String {
        details.columns[index].id.clone()
    }

    #[test]
    fn entering_a_done_column_stamps_completed_at() {
        let state = state();
        let details = done_board(&state);
        let task = column_task(&state, "p1", &column_of(&details, 0), "A");
        assert_eq!(task.completed_at, None);

        let moved = move_task(&state, &task.id, &column_of(&details, 2), None).expect("moves");

        assert_eq!(
            moved.completed_at.as_deref(),
            Some(moved.updated_at.as_str())
        );
    }

    #[test]
    fn moves_between_open_columns_leave_completed_at_empty() {
        let state = state();
        let details = done_board(&state);
        let task = column_task(&state, "p1", &column_of(&details, 0), "A");

        let moved = move_task(&state, &task.id, &column_of(&details, 1), None).expect("moves");

        assert_eq!(moved.completed_at, None);
    }

    #[test]
    fn leaving_a_done_column_clears_completed_at() {
        let state = state();
        let details = done_board(&state);
        let task = column_task(&state, "p1", &column_of(&details, 2), "A");
        assert!(task.completed_at.is_some());

        let reopened = move_task(&state, &task.id, &column_of(&details, 1), None).expect("moves");

        assert_eq!(reopened.completed_at, None);
    }

    #[test]
    fn moving_between_done_columns_keeps_the_original_stamp() {
        let state = state();
        let details = done_board(&state);
        let task = column_task(&state, "p1", &column_of(&details, 2), "A");
        std::thread::sleep(std::time::Duration::from_millis(3));

        let moved = move_task(&state, &task.id, &column_of(&details, 3), None).expect("moves");

        assert_eq!(moved.completed_at, task.completed_at);
        assert!(moved.updated_at > task.updated_at);
    }

    #[test]
    fn reordering_inside_a_done_column_keeps_the_stamp() {
        let state = state();
        let details = done_board(&state);
        let done = column_of(&details, 2);
        column_task(&state, "p1", &done, "A");
        let second = column_task(&state, "p1", &done, "B");
        std::thread::sleep(std::time::Duration::from_millis(3));

        let moved = move_task(&state, &second.id, &done, None).expect("moves to the top");

        assert_eq!(moved.completed_at, second.completed_at);
    }

    #[test]
    fn sending_to_a_board_stamps_only_when_the_column_is_done() {
        let state = state();
        let details = done_board(&state);
        let to_done = backlog_task(&state, "p1", "Finished already");
        let to_todo = backlog_task(&state, "p1", "Fresh");

        let finished = send_to_board(
            &state,
            &to_done.id,
            &details.board.id,
            Some(column_of(&details, 2)),
        )
        .expect("sends to done");
        let fresh = send_to_board(&state, &to_todo.id, &details.board.id, None).expect("sends");

        assert!(finished.completed_at.is_some());
        assert_eq!(fresh.completed_at, None);
    }

    #[test]
    fn sending_a_completed_task_to_the_backlog_clears_completed_at() {
        let state = state();
        let details = done_board(&state);
        let task = column_task(&state, "p1", &column_of(&details, 2), "A");

        let back = send_to_backlog(&state, &task.id).expect("returns");

        assert_eq!((back.board_id, back.completed_at), (None, None));
    }

    #[test]
    fn moving_to_the_done_column_of_another_board_stamps_a_task_that_was_open() {
        let state = state();
        let first = done_board(&state);
        let second = board(&state, "p1", "Second", &["Todo", "Done"]);
        let task = column_task(&state, "p1", &column_of(&first, 0), "A");

        let moved = move_task(&state, &task.id, &column_of(&second, 1), None).expect("moves");

        assert!(moved.completed_at.is_some());
    }

    #[test]
    fn changing_a_column_kind_does_not_reprocess_its_tasks_until_they_move() {
        let state = state();
        let details = done_board(&state);
        let done = column_of(&details, 2);
        let task = column_task(&state, "p1", &done, "A");
        crate::modules::boards::column_service::update(
            &state,
            &done,
            crate::modules::boards::models::UpdateColumnInput {
                kind: Some(ColumnKind::InProgress),
                ..Default::default()
            },
        )
        .expect("changes kind");

        let untouched = tasks::get(&state, &task.id).expect("reads");
        let moved = move_task(&state, &task.id, &column_of(&details, 1), None).expect("moves");

        assert_eq!(untouched.completed_at, task.completed_at);
        assert_eq!(moved.completed_at, None);
    }

    #[test]
    fn a_task_in_a_done_column_without_a_stamp_gets_one_when_it_moves_to_another_done_column() {
        let state = state();
        let details = done_board(&state);
        let task = column_task(&state, "p1", &column_of(&details, 2), "A");
        state
            .database()
            .execute(
                "UPDATE tasks SET completed_at = NULL WHERE id = ?1",
                [&task.id],
            )
            .expect("clears stamp");

        let moved = move_task(&state, &task.id, &column_of(&details, 3), None).expect("moves");

        assert_eq!(
            moved.completed_at.as_deref(),
            Some(moved.updated_at.as_str())
        );
    }

    #[test]
    fn completion_rules_in_isolation() {
        let open = Origin::Column {
            board: "B".into(),
            column: "C".into(),
            kind: ColumnKind::InProgress,
        };
        let done = Origin::Column {
            board: "B".into(),
            column: "D".into(),
            kind: ColumnKind::Done,
        };
        let stamp = Some("old");
        let done_kind = Some(ColumnKind::Done);

        assert_eq!(
            completion_after_move(&Origin::Backlog, done_kind, None, "now"),
            Some("now".into())
        );
        assert_eq!(
            completion_after_move(&open, done_kind, stamp, "now"),
            Some("now".into())
        );
        assert_eq!(
            completion_after_move(&done, done_kind, stamp, "now"),
            Some("old".into())
        );
        assert_eq!(
            completion_after_move(&done, done_kind, None, "now"),
            Some("now".into())
        );
        assert_eq!(
            completion_after_move(&done, Some(ColumnKind::Todo), stamp, "now"),
            None
        );
        assert_eq!(completion_after_move(&done, None, stamp, "now"), None);
    }
}
