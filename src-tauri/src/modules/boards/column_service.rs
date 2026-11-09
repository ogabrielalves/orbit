use rusqlite::Connection;

use super::models::{BoardColumn, ColumnKind, CreateColumnInput, UpdateColumnInput};
use super::repository::{self, ColumnSlot};
use super::service::{COLUMN_NAME_MAX_LENGTH, MAX_COLUMNS_PER_BOARD, find_existing};
use crate::error::{AppError, AppResult};
use crate::modules::activity::models::{ActivityAction, ChangeSet, EntityType};
use crate::modules::activity::service as activity;
use crate::shared::position::{self, Slot};
use crate::shared::text::{optional_text, require_text};
use crate::shared::time;
use crate::state::AppState;

pub fn create(state: &AppState, input: CreateColumnInput) -> AppResult<BoardColumn> {
    let name = require_text("column name", &input.name, COLUMN_NAME_MAX_LENGTH)?;

    let mut connection = state.database();
    let transaction = connection.transaction()?;
    find_existing(&transaction, &input.board_id)?;

    let slots = repository::list_column_slots(&transaction, &input.board_id)?;
    let has_reached_limit = slots.len() >= MAX_COLUMNS_PER_BOARD;
    if has_reached_limit {
        return Err(AppError::Validation(format!(
            "a board cannot have more than {MAX_COLUMNS_PER_BOARD} columns"
        )));
    }
    let next_position = match slots.last() {
        Some(last) => position::after(&last.position)?,
        None => position::first(),
    };

    let column = BoardColumn::new(
        &input.board_id,
        name,
        optional_text(input.color),
        input.kind.unwrap_or(ColumnKind::InProgress),
        next_position,
        &time::now(),
    );
    repository::insert_column(&transaction, &column)?;
    let mut changes = ChangeSet::new();
    changes.track("name", None, Some(column.name.as_str()));
    changes.track("kind", None, Some(column.kind.as_str()));
    record(&transaction, &column.id, ActivityAction::Created, changes)?;
    transaction.commit()?;
    Ok(column)
}

pub fn update(state: &AppState, id: &str, input: UpdateColumnInput) -> AppResult<BoardColumn> {
    let mut connection = state.database();
    let transaction = connection.transaction()?;
    let current = find_column(&transaction, id)?;

    let mut changed = current.clone();
    if let Some(name) = input.name {
        changed.name = require_text("column name", &name, COLUMN_NAME_MAX_LENGTH)?;
    }
    if let Some(color) = input.color {
        changed.color = optional_text(color);
    }
    if let Some(kind) = input.kind {
        changed.kind = kind;
    }

    let mut changes = ChangeSet::new();
    changes.track(
        "name",
        Some(current.name.as_str()),
        Some(changed.name.as_str()),
    );
    changes.track("color", current.color.as_deref(), changed.color.as_deref());
    changes.track(
        "kind",
        Some(current.kind.as_str()),
        Some(changed.kind.as_str()),
    );
    let has_changes = !changes.is_empty();
    if !has_changes {
        return Ok(current);
    }

    changed.updated_at = time::now();
    repository::update_column(&transaction, &changed)?;
    record(&transaction, id, ActivityAction::Updated, changes)?;
    transaction.commit()?;
    Ok(changed)
}

pub fn move_column(
    state: &AppState,
    id: &str,
    after_column_id: Option<String>,
) -> AppResult<BoardColumn> {
    let mut connection = state.database();
    let transaction = connection.transaction()?;
    let current = find_column(&transaction, id)?;
    let slots = repository::list_column_slots(&transaction, &current.board_id)?;

    let ordered = to_slots(&slots);
    let is_already_there =
        position::previous_sibling_id(&ordered, id) == after_column_id.as_deref();
    if is_already_there {
        return Ok(current);
    }

    let siblings: Vec<Slot<'_>> = ordered
        .iter()
        .filter(|slot| slot.id != id)
        .copied()
        .collect();
    let new_position = position::place_after(&siblings, after_column_id.as_deref())?;

    let mut changes = ChangeSet::new();
    changes.track(
        "position",
        Some(current.position.as_str()),
        Some(new_position.as_str()),
    );
    let moved = BoardColumn {
        position: new_position,
        updated_at: time::now(),
        ..current
    };
    repository::update_column(&transaction, &moved)?;
    record(&transaction, id, ActivityAction::Moved, changes)?;
    transaction.commit()?;
    Ok(moved)
}

pub fn delete(state: &AppState, id: &str) -> AppResult<()> {
    let mut connection = state.database();
    let transaction = connection.transaction()?;
    let current = find_column(&transaction, id)?;

    let task_count = repository::count_tasks_referencing_column(&transaction, id)?;
    let still_has_tasks = task_count > 0;
    if still_has_tasks {
        return Err(AppError::Conflict(
            "column still has tasks; move them to another column first".into(),
        ));
    }

    repository::delete_column(&transaction, id)?;
    let mut changes = ChangeSet::new();
    changes.track("name", Some(current.name.as_str()), None);
    record(&transaction, id, ActivityAction::Deleted, changes)?;
    transaction.commit()?;
    Ok(())
}

fn find_column(connection: &Connection, id: &str) -> AppResult<BoardColumn> {
    repository::find_column(connection, id)?.ok_or_else(|| AppError::NotFound("column".into()))
}

fn record(
    connection: &Connection,
    column_id: &str,
    action: ActivityAction,
    changes: ChangeSet,
) -> AppResult<()> {
    activity::record(connection, EntityType::Column, column_id, action, changes)
}

fn to_slots(slots: &[ColumnSlot]) -> Vec<Slot<'_>> {
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
    use crate::modules::activity::models::ActivityEntry;
    use crate::modules::boards::models::{BoardDetails, ColumnKind, CreateBoardInput, NewColumn};
    use crate::modules::boards::service as boards;
    use std::time::Duration;

    const NOW: &str = "2026-11-08T10:00:00.000Z";

    fn state() -> AppState {
        let mut connection = open_in_memory().expect("opens");
        migrations::run(&mut connection).expect("migrates");
        connection
            .execute(
                "INSERT INTO projects (id, name, created_at, updated_at) VALUES ('p1', 'P', ?1, ?1)",
                [NOW],
            )
            .expect("project");
        AppState::new(connection, None)
    }

    fn board_with_columns(state: &AppState, names: &[&str]) -> BoardDetails {
        boards::create(
            state,
            CreateBoardInput {
                project_id: "p1".into(),
                name: "Board".into(),
                columns: Some(
                    names
                        .iter()
                        .map(|name| NewColumn::new(name, ColumnKind::InProgress))
                        .collect(),
                ),
            },
        )
        .expect("creates board")
    }

    fn names_in_order(state: &AppState, board_id: &str) -> Vec<String> {
        boards::get(state, board_id)
            .expect("reads")
            .columns
            .into_iter()
            .map(|column| column.name)
            .collect()
    }

    fn id_of<'a>(details: &'a BoardDetails, name: &str) -> &'a str {
        details
            .columns
            .iter()
            .find(|column| column.name == name)
            .map(|column| column.id.as_str())
            .expect("column exists")
    }

    fn entries(state: &AppState) -> Vec<ActivityEntry> {
        let mut all = activity::recent(state, Some(100)).expect("reads activity");
        all.reverse();
        all
    }

    fn column_entries(state: &AppState) -> Vec<ActivityEntry> {
        entries(state)
            .into_iter()
            .filter(|entry| entry.entity_type == EntityType::Column)
            .collect()
    }

    fn new_column(board_id: &str, name: &str) -> CreateColumnInput {
        CreateColumnInput {
            board_id: board_id.into(),
            name: name.into(),
            color: None,
            kind: None,
        }
    }

    fn seed_task(state: &AppState, task_id: &str, board_id: &str, column_id: &str) {
        state
            .database()
            .execute(
                "INSERT INTO tasks (id, project_id, board_id, column_id, title, position, created_at, updated_at)
                 VALUES (?1, 'p1', ?2, ?3, 'T', 'V', ?4, ?4)",
                (task_id, board_id, column_id, NOW),
            )
            .expect("task");
    }

    #[test]
    fn create_appends_the_column_after_the_last_one() {
        let state = state();
        let board = board_with_columns(&state, &["A", "B"]);

        let created = create(&state, new_column(&board.board.id, " C ")).expect("creates");

        assert_eq!(created.name, "C");
        assert_eq!(created.task_count, 0);
        assert!(created.position > board.columns[1].position);
        assert_eq!(names_in_order(&state, &board.board.id), ["A", "B", "C"]);
    }

    #[test]
    fn create_in_an_empty_board_uses_the_first_position() {
        let state = state();
        let board = board_with_columns(&state, &[]);

        let created = create(&state, new_column(&board.board.id, "Only")).expect("creates");

        assert_eq!(created.position, position::first());
    }

    #[test]
    fn create_keeps_the_color_and_drops_a_blank_one() {
        let state = state();
        let board = board_with_columns(&state, &[]);
        let colored = CreateColumnInput {
            color: Some(" #ff0000 ".into()),
            ..new_column(&board.board.id, "Red")
        };
        let blank = CreateColumnInput {
            color: Some("  ".into()),
            ..new_column(&board.board.id, "Plain")
        };

        let first = create(&state, colored).expect("creates");
        let second = create(&state, blank).expect("creates");

        assert_eq!(first.color.as_deref(), Some("#ff0000"));
        assert_eq!(second.color, None);
    }

    #[test]
    fn create_validates_name_board_and_column_limit() {
        let state = state();
        let board = board_with_columns(&state, &[]);
        let too_long = "x".repeat(COLUMN_NAME_MAX_LENGTH + 1);

        assert!(matches!(
            create(&state, new_column(&board.board.id, "  ")),
            Err(AppError::Validation(_))
        ));
        assert!(matches!(
            create(&state, new_column(&board.board.id, &too_long)),
            Err(AppError::Validation(_))
        ));
        assert!(matches!(
            create(&state, new_column("missing", "Name")),
            Err(AppError::NotFound(_))
        ));
        for index in 0..MAX_COLUMNS_PER_BOARD {
            create(&state, new_column(&board.board.id, &format!("C{index}")))
                .expect("within limit");
        }
        assert!(matches!(
            create(&state, new_column(&board.board.id, "One too many")),
            Err(AppError::Validation(_))
        ));
    }

    #[test]
    fn create_logs_a_column_entry_with_the_name() {
        let state = state();
        let board = board_with_columns(&state, &[]);

        let created = create(&state, new_column(&board.board.id, "Review")).expect("creates");

        let logged = column_entries(&state);
        assert_eq!(logged.len(), 1);
        assert_eq!(logged[0].entity_id, created.id);
        assert_eq!(logged[0].action, ActivityAction::Created);
        let changes = logged[0].changes.as_ref().expect("has changes");
        assert_eq!(changes["name"].to.as_deref(), Some("Review"));
    }

    #[test]
    fn update_renames_and_recolors() {
        let state = state();
        let board = board_with_columns(&state, &["Old"]);
        let id = board.columns[0].id.clone();
        std::thread::sleep(Duration::from_millis(3));

        let updated = update(
            &state,
            &id,
            UpdateColumnInput {
                name: Some(" New ".into()),
                color: Some(Some("#00ff00".into())),
                kind: None,
            },
        )
        .expect("updates");

        assert_eq!(updated.name, "New");
        assert_eq!(updated.color.as_deref(), Some("#00ff00"));
        assert!(updated.updated_at > board.columns[0].updated_at);
        assert_eq!(updated.position, board.columns[0].position);
        assert_eq!(
            boards::get(&state, &board.board.id).expect("reads").columns[0],
            updated
        );
    }

    #[test]
    fn update_can_clear_the_color_without_touching_the_name() {
        let state = state();
        let board = board_with_columns(&state, &["Name"]);
        let id = board.columns[0].id.clone();
        update(
            &state,
            &id,
            UpdateColumnInput {
                color: Some(Some("red".into())),
                ..Default::default()
            },
        )
        .expect("sets");

        let cleared = update(
            &state,
            &id,
            UpdateColumnInput {
                color: Some(None),
                ..Default::default()
            },
        )
        .expect("clears");

        assert_eq!(cleared.color, None);
        assert_eq!(cleared.name, "Name");
    }

    #[test]
    fn update_logs_only_changed_fields_and_ignores_no_ops() {
        let state = state();
        let board = board_with_columns(&state, &["Old"]);
        let id = board.columns[0].id.clone();

        update(
            &state,
            &id,
            UpdateColumnInput {
                name: Some("Old".into()),
                ..Default::default()
            },
        )
        .expect("no-op");
        update(
            &state,
            &id,
            UpdateColumnInput {
                name: Some("New".into()),
                ..Default::default()
            },
        )
        .expect("renames");

        let logged = column_entries(&state);
        assert_eq!(logged.len(), 1);
        assert_eq!(logged[0].action, ActivityAction::Updated);
        let changes = logged[0].changes.as_ref().expect("has changes");
        assert_eq!(changes.len(), 1);
        assert_eq!(changes["name"].from.as_deref(), Some("Old"));
    }

    #[test]
    fn update_rejects_blank_name_and_unknown_column() {
        let state = state();
        let board = board_with_columns(&state, &["Keep"]);
        let id = board.columns[0].id.clone();

        let blank = update(
            &state,
            &id,
            UpdateColumnInput {
                name: Some(" ".into()),
                ..Default::default()
            },
        );
        let unknown = update(&state, "missing", UpdateColumnInput::default());

        assert!(matches!(blank, Err(AppError::Validation(_))));
        assert!(matches!(unknown, Err(AppError::NotFound(_))));
        assert_eq!(names_in_order(&state, &board.board.id), ["Keep"]);
    }

    #[test]
    fn move_to_the_first_position() {
        let state = state();
        let board = board_with_columns(&state, &["A", "B", "C"]);

        move_column(&state, id_of(&board, "C"), None).expect("moves");

        assert_eq!(names_in_order(&state, &board.board.id), ["C", "A", "B"]);
    }

    #[test]
    fn move_into_the_middle() {
        let state = state();
        let board = board_with_columns(&state, &["A", "B", "C", "D"]);

        move_column(
            &state,
            id_of(&board, "D"),
            Some(id_of(&board, "A").to_string()),
        )
        .expect("moves");

        assert_eq!(
            names_in_order(&state, &board.board.id),
            ["A", "D", "B", "C"]
        );
    }

    #[test]
    fn move_to_the_last_position() {
        let state = state();
        let board = board_with_columns(&state, &["A", "B", "C"]);

        move_column(
            &state,
            id_of(&board, "A"),
            Some(id_of(&board, "C").to_string()),
        )
        .expect("moves");

        assert_eq!(names_in_order(&state, &board.board.id), ["B", "C", "A"]);
    }

    #[test]
    fn move_changes_only_the_moved_column() {
        let state = state();
        let board = board_with_columns(&state, &["A", "B", "C"]);

        move_column(&state, id_of(&board, "C"), None).expect("moves");

        let after = boards::get(&state, &board.board.id).expect("reads");
        for name in ["A", "B"] {
            let before_column = board.columns.iter().find(|column| column.name == name);
            let after_column = after.columns.iter().find(|column| column.name == name);
            assert_eq!(before_column, after_column);
        }
    }

    #[test]
    fn move_to_where_it_already_is_changes_and_logs_nothing() {
        let state = state();
        let board = board_with_columns(&state, &["A", "B", "C"]);

        let same_spot = move_column(
            &state,
            id_of(&board, "B"),
            Some(id_of(&board, "A").to_string()),
        )
        .expect("moves");
        let already_first = move_column(&state, id_of(&board, "A"), None).expect("moves");

        assert_eq!(same_spot, board.columns[1]);
        assert_eq!(already_first, board.columns[0]);
        assert!(column_entries(&state).is_empty());
    }

    #[test]
    fn move_of_the_only_column_is_a_no_op() {
        let state = state();
        let board = board_with_columns(&state, &["Only"]);

        let moved = move_column(&state, &board.columns[0].id, None).expect("moves");

        assert_eq!(moved, board.columns[0]);
    }

    #[test]
    fn move_rejects_invalid_targets() {
        let state = state();
        let board = board_with_columns(&state, &["A", "B"]);
        let other = board_with_columns(&state, &["X"]);
        let a = id_of(&board, "A").to_string();

        let after_itself = move_column(&state, &a, Some(a.clone()));
        let after_missing = move_column(&state, &a, Some("missing".into()));
        let after_foreign = move_column(&state, &a, Some(other.columns[0].id.clone()));
        let unknown = move_column(&state, "missing", None);

        assert!(matches!(after_itself, Err(AppError::InvalidMove)));
        assert!(matches!(after_missing, Err(AppError::InvalidMove)));
        assert!(matches!(after_foreign, Err(AppError::InvalidMove)));
        assert!(matches!(unknown, Err(AppError::NotFound(_))));
        assert_eq!(names_in_order(&state, &board.board.id), ["A", "B"]);
    }

    #[test]
    fn move_logs_the_position_change() {
        let state = state();
        let board = board_with_columns(&state, &["A", "B"]);
        let before_position = board.columns[1].position.clone();

        let moved = move_column(&state, id_of(&board, "B"), None).expect("moves");

        let logged = column_entries(&state);
        assert_eq!(logged.len(), 1);
        assert_eq!(logged[0].action, ActivityAction::Moved);
        let changes = logged[0].changes.as_ref().expect("has changes");
        assert_eq!(
            changes["position"].from.as_deref(),
            Some(before_position.as_str())
        );
        assert_eq!(
            changes["position"].to.as_deref(),
            Some(moved.position.as_str())
        );
    }

    #[test]
    fn many_random_moves_keep_the_order_identical_to_a_plain_list() {
        let state = state();
        let names = ["A", "B", "C", "D", "E", "F", "G", "H"];
        let board = board_with_columns(&state, &names);
        let mut expected: Vec<String> = names.iter().map(|name| name.to_string()).collect();
        let mut seed: u64 = 7;
        let mut next_random = move |limit: usize| {
            seed = seed
                .wrapping_mul(6364136223846793005)
                .wrapping_add(1442695040888963407);
            ((seed >> 33) as usize) % limit
        };

        for _ in 0..150 {
            let moved_name = expected.remove(next_random(expected.len()));
            let slot = next_random(expected.len() + 1);
            let after = slot
                .checked_sub(1)
                .map(|index| id_of(&board, &expected[index]).to_string());
            expected.insert(slot, moved_name.clone());
            move_column(&state, id_of(&board, &moved_name), after).expect("moves");
        }

        assert_eq!(names_in_order(&state, &board.board.id), expected);
    }

    #[test]
    fn delete_removes_an_empty_column_and_logs_its_name() {
        let state = state();
        let board = board_with_columns(&state, &["Keep", "Drop"]);

        delete(&state, id_of(&board, "Drop")).expect("deletes");

        assert_eq!(names_in_order(&state, &board.board.id), ["Keep"]);
        let logged = column_entries(&state);
        assert_eq!(logged[0].action, ActivityAction::Deleted);
        let changes = logged[0].changes.as_ref().expect("has changes");
        assert_eq!(changes["name"].from.as_deref(), Some("Drop"));
        assert_eq!(changes["name"].to, None);
    }

    #[test]
    fn delete_is_blocked_while_the_column_has_tasks() {
        let state = state();
        let board = board_with_columns(&state, &["Busy", "Free"]);
        let busy = id_of(&board, "Busy").to_string();
        seed_task(&state, "t1", &board.board.id, &busy);

        let result = delete(&state, &busy);

        assert!(matches!(&result, Err(AppError::Conflict(message)) if message.contains("tasks")));
        assert_eq!(names_in_order(&state, &board.board.id), ["Busy", "Free"]);
        assert!(column_entries(&state).is_empty());
    }

    #[test]
    fn delete_is_also_blocked_by_archived_tasks_and_subtasks() {
        let state = state();
        let board = board_with_columns(&state, &["Busy"]);
        let busy = board.columns[0].id.clone();
        seed_task(&state, "t1", &board.board.id, &busy);
        state
            .database()
            .execute("UPDATE tasks SET archived_at = ?1 WHERE id = 't1'", [NOW])
            .expect("archives");

        let result = delete(&state, &busy);

        assert!(matches!(result, Err(AppError::Conflict(_))));
    }

    #[test]
    fn delete_works_once_the_tasks_were_moved_to_another_column() {
        let state = state();
        let board = board_with_columns(&state, &["From", "To"]);
        let from = id_of(&board, "From").to_string();
        let to = id_of(&board, "To").to_string();
        seed_task(&state, "t1", &board.board.id, &from);
        state
            .database()
            .execute("UPDATE tasks SET column_id = ?1 WHERE id = 't1'", [&to])
            .expect("moves task");

        delete(&state, &from).expect("deletes");

        let reloaded = boards::get(&state, &board.board.id).expect("reads");
        assert_eq!(reloaded.columns.len(), 1);
        assert_eq!(reloaded.columns[0].task_count, 1);
    }

    #[test]
    fn delete_of_unknown_column_is_not_found() {
        let state = state();

        assert!(matches!(
            delete(&state, "missing"),
            Err(AppError::NotFound(_))
        ));
    }

    #[test]
    fn a_failing_activity_write_rolls_the_column_change_back() {
        let state = state();
        let board = board_with_columns(&state, &["A", "B"]);
        state
            .database()
            .execute_batch("DROP TABLE activity_log;")
            .expect("drops log table");

        let created = create(&state, new_column(&board.board.id, "C"));
        let renamed = update(
            &state,
            id_of(&board, "A"),
            UpdateColumnInput {
                name: Some("Z".into()),
                ..Default::default()
            },
        );
        let moved = move_column(&state, id_of(&board, "B"), None);
        let deleted = delete(&state, id_of(&board, "A"));

        assert!(created.is_err() && renamed.is_err() && moved.is_err() && deleted.is_err());
        assert_eq!(names_in_order(&state, &board.board.id), ["A", "B"]);
    }

    #[test]
    fn create_defaults_the_kind_to_in_progress_and_accepts_an_explicit_one() {
        let state = state();
        let board = board_with_columns(&state, &["A"]);

        let default = create(&state, new_column(&board.board.id, "B")).expect("creates");
        let explicit = create(
            &state,
            CreateColumnInput {
                kind: Some(ColumnKind::Done),
                ..new_column(&board.board.id, "C")
            },
        )
        .expect("creates");

        assert_eq!(default.kind, ColumnKind::InProgress);
        assert_eq!(explicit.kind, ColumnKind::Done);
    }

    #[test]
    fn update_changes_the_kind_and_logs_it() {
        let state = state();
        let board = board_with_columns(&state, &["A"]);
        let id = board.columns[0].id.clone();

        let updated = update(
            &state,
            &id,
            UpdateColumnInput {
                kind: Some(ColumnKind::Done),
                ..Default::default()
            },
        )
        .expect("updates");

        assert_eq!(updated.kind, ColumnKind::Done);
        let logged = column_entries(&state);
        let changes = logged
            .last()
            .and_then(|entry| entry.changes.as_ref())
            .expect("has changes");
        assert_eq!(changes["kind"].from.as_deref(), Some("in_progress"));
        assert_eq!(changes["kind"].to.as_deref(), Some("done"));
    }

    #[test]
    fn update_with_the_same_kind_is_a_no_op_without_a_log_entry() {
        let state = state();
        let board = board_with_columns(&state, &["A"]);
        let id = board.columns[0].id.clone();
        let before = column_entries(&state).len();

        update(
            &state,
            &id,
            UpdateColumnInput {
                kind: Some(ColumnKind::InProgress),
                ..Default::default()
            },
        )
        .expect("updates");

        assert_eq!(column_entries(&state).len(), before);
    }
}
