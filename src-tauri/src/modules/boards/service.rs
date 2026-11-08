use rusqlite::Connection;

use super::models::{
    Board, BoardColumn, BoardDetails, CreateBoardInput, DEFAULT_COLUMN_NAMES, UpdateBoardInput,
};
use super::repository;
use crate::error::{AppError, AppResult};
use crate::modules::activity::models::{ActivityAction, ChangeSet, EntityType};
use crate::modules::activity::service as activity;
use crate::shared::text::require_text;
use crate::shared::{id, position, time};
use crate::state::AppState;

pub const BOARD_NAME_MAX_LENGTH: usize = 120;
pub const COLUMN_NAME_MAX_LENGTH: usize = 60;
pub const MAX_COLUMNS_PER_BOARD: usize = 30;

pub fn create(state: &AppState, input: CreateBoardInput) -> AppResult<BoardDetails> {
    let name = require_text("board name", &input.name, BOARD_NAME_MAX_LENGTH)?;
    let column_names = resolve_column_names(input.column_names)?;

    let mut connection = state.database();
    let transaction = connection.transaction()?;
    let project_exists = repository::project_exists(&transaction, &input.project_id)?;
    if !project_exists {
        return Err(AppError::NotFound("project".into()));
    }

    let now = time::now();
    let board = Board {
        id: id::new_id(),
        project_id: input.project_id,
        name,
        created_at: now.clone(),
        updated_at: now.clone(),
    };
    repository::insert_board(&transaction, &board)?;
    for column in initial_columns(&board.id, column_names, &now)? {
        repository::insert_column(&transaction, &column)?;
    }
    let mut changes = ChangeSet::new();
    changes.track("name", None, Some(board.name.as_str()));
    activity::record(
        &transaction,
        EntityType::Board,
        &board.id,
        ActivityAction::Created,
        changes,
    )?;
    let details = load_details(&transaction, &board.id)?;
    transaction.commit()?;
    Ok(details)
}

pub fn get(state: &AppState, id: &str) -> AppResult<BoardDetails> {
    let connection = state.database();
    load_details(&connection, id)
}

pub fn update(state: &AppState, id: &str, input: UpdateBoardInput) -> AppResult<Board> {
    let mut connection = state.database();
    let transaction = connection.transaction()?;
    let current = find_existing(&transaction, id)?;
    let name = match input.name {
        Some(name) => require_text("board name", &name, BOARD_NAME_MAX_LENGTH)?,
        None => current.name.clone(),
    };

    let mut changes = ChangeSet::new();
    changes.track("name", Some(current.name.as_str()), Some(name.as_str()));
    let has_changes = !changes.is_empty();
    if !has_changes {
        return Ok(current);
    }

    let updated = Board {
        name,
        updated_at: time::now(),
        ..current
    };
    repository::update_board(&transaction, &updated)?;
    activity::record(
        &transaction,
        EntityType::Board,
        id,
        ActivityAction::Updated,
        changes,
    )?;
    transaction.commit()?;
    Ok(updated)
}

pub fn delete(state: &AppState, id: &str) -> AppResult<()> {
    let mut connection = state.database();
    let transaction = connection.transaction()?;
    let board = find_existing(&transaction, id)?;

    let task_ids = repository::find_task_ids_on_board(&transaction, id)?;
    repository::detach_tasks_from_board(&transaction, id, &time::now())?;
    for task_id in &task_ids {
        let mut moved = ChangeSet::new();
        moved.track("board", Some(board.name.as_str()), None);
        activity::record(
            &transaction,
            EntityType::Task,
            task_id,
            ActivityAction::Moved,
            moved,
        )?;
    }

    repository::delete_board(&transaction, id)?;
    let mut deleted = ChangeSet::new();
    deleted.track("name", Some(board.name.as_str()), None);
    activity::record(
        &transaction,
        EntityType::Board,
        id,
        ActivityAction::Deleted,
        deleted,
    )?;
    transaction.commit()?;
    Ok(())
}

pub(super) fn find_existing(connection: &Connection, id: &str) -> AppResult<Board> {
    repository::find_board(connection, id)?.ok_or_else(|| AppError::NotFound("board".into()))
}

fn load_details(connection: &Connection, id: &str) -> AppResult<BoardDetails> {
    let board = find_existing(connection, id)?;
    let columns = repository::list_columns(connection, id)?;
    Ok(BoardDetails { board, columns })
}

fn resolve_column_names(requested: Option<Vec<String>>) -> AppResult<Vec<String>> {
    let names = requested.unwrap_or_else(|| {
        DEFAULT_COLUMN_NAMES
            .iter()
            .map(|name| name.to_string())
            .collect()
    });

    let has_too_many_columns = names.len() > MAX_COLUMNS_PER_BOARD;
    if has_too_many_columns {
        return Err(AppError::Validation(format!(
            "a board cannot have more than {MAX_COLUMNS_PER_BOARD} columns"
        )));
    }
    names
        .iter()
        .map(|name| require_text("column name", name, COLUMN_NAME_MAX_LENGTH))
        .collect()
}

fn initial_columns(board_id: &str, names: Vec<String>, now: &str) -> AppResult<Vec<BoardColumn>> {
    let mut columns: Vec<BoardColumn> = Vec::with_capacity(names.len());
    for name in names {
        let next_position = match columns.last() {
            Some(previous) => position::after(&previous.position)?,
            None => position::first(),
        };
        columns.push(BoardColumn::new(board_id, name, None, next_position, now));
    }
    Ok(columns)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{connection::open_in_memory, migrations};
    use crate::modules::activity::models::ActivityEntry;
    use std::time::Duration;

    const NOW: &str = "2026-11-08T10:00:00.000Z";

    fn state_with_project() -> (AppState, String) {
        let mut connection = open_in_memory().expect("opens");
        migrations::run(&mut connection).expect("migrates");
        connection
            .execute(
                "INSERT INTO projects (id, name, created_at, updated_at) VALUES ('p1', 'P', ?1, ?1)",
                [NOW],
            )
            .expect("project");
        (AppState::new(connection, None), "p1".to_string())
    }

    fn input(project_id: &str, name: &str) -> CreateBoardInput {
        CreateBoardInput {
            project_id: project_id.into(),
            name: name.into(),
            column_names: None,
        }
    }

    fn create_named(state: &AppState, project_id: &str, name: &str) -> BoardDetails {
        create(state, input(project_id, name)).expect("creates")
    }

    fn column_names(details: &BoardDetails) -> Vec<&str> {
        details
            .columns
            .iter()
            .map(|column| column.name.as_str())
            .collect()
    }

    fn entries(state: &AppState) -> Vec<ActivityEntry> {
        let mut all = activity::recent(state, Some(100)).expect("reads activity");
        all.reverse();
        all
    }

    fn count(state: &AppState, table: &str) -> i64 {
        state
            .database()
            .query_row(&format!("SELECT COUNT(*) FROM {table}"), [], |row| {
                row.get(0)
            })
            .expect("counts")
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
    fn create_builds_the_default_column_set_in_order() {
        let (state, project_id) = state_with_project();

        let details = create_named(&state, &project_id, "  Sprint  ");

        assert_eq!(details.board.name, "Sprint");
        assert_eq!(details.board.project_id, project_id);
        assert_eq!(
            column_names(&details),
            ["Backlog", "To Do", "In Progress", "In Review", "Done"]
        );
        assert!(details.columns.iter().all(|column| column.task_count == 0));
        assert!(
            details
                .columns
                .iter()
                .all(|column| column.board_id == details.board.id)
        );
    }

    #[test]
    fn default_columns_have_strictly_increasing_positions() {
        let (state, project_id) = state_with_project();

        let details = create_named(&state, &project_id, "Sprint");

        let positions: Vec<&str> = details
            .columns
            .iter()
            .map(|column| column.position.as_str())
            .collect();
        let mut sorted = positions.clone();
        sorted.sort_unstable();
        sorted.dedup();
        assert_eq!(positions, sorted);
    }

    #[test]
    fn create_uses_the_column_names_sent_by_the_front() {
        let (state, project_id) = state_with_project();
        let translated = CreateBoardInput {
            column_names: Some(vec![
                " Pendente ".into(),
                "Em andamento".into(),
                "Feito".into(),
            ]),
            ..input(&project_id, "Quadro")
        };

        let details = create(&state, translated).expect("creates");

        assert_eq!(
            column_names(&details),
            ["Pendente", "Em andamento", "Feito"]
        );
    }

    #[test]
    fn create_with_an_empty_name_list_makes_an_empty_board() {
        let (state, project_id) = state_with_project();
        let empty = CreateBoardInput {
            column_names: Some(vec![]),
            ..input(&project_id, "Empty")
        };

        let details = create(&state, empty).expect("creates");

        assert!(details.columns.is_empty());
    }

    #[test]
    fn create_is_persisted() {
        let (state, project_id) = state_with_project();

        let created = create_named(&state, &project_id, "Sprint");

        assert_eq!(get(&state, &created.board.id).expect("reads"), created);
    }

    #[test]
    fn create_rejects_invalid_board_and_column_names() {
        let (state, project_id) = state_with_project();
        let too_long = "x".repeat(BOARD_NAME_MAX_LENGTH + 1);
        let long_column = CreateBoardInput {
            column_names: Some(vec!["y".repeat(COLUMN_NAME_MAX_LENGTH + 1)]),
            ..input(&project_id, "Board")
        };
        let blank_column = CreateBoardInput {
            column_names: Some(vec!["Ok".into(), "  ".into()]),
            ..input(&project_id, "Board")
        };

        assert!(matches!(
            create(&state, input(&project_id, "  ")),
            Err(AppError::Validation(_))
        ));
        assert!(matches!(
            create(&state, input(&project_id, &too_long)),
            Err(AppError::Validation(_))
        ));
        assert!(matches!(
            create(&state, long_column),
            Err(AppError::Validation(_))
        ));
        assert!(matches!(
            create(&state, blank_column),
            Err(AppError::Validation(_))
        ));
        assert_eq!(count(&state, "boards"), 0);
        assert_eq!(count(&state, "columns"), 0);
    }

    #[test]
    fn create_rejects_more_columns_than_the_limit() {
        let (state, project_id) = state_with_project();
        let names = |amount: usize| (0..amount).map(|index| format!("C{index}")).collect();
        let at_limit = CreateBoardInput {
            column_names: Some(names(MAX_COLUMNS_PER_BOARD)),
            ..input(&project_id, "At limit")
        };
        let over_limit = CreateBoardInput {
            column_names: Some(names(MAX_COLUMNS_PER_BOARD + 1)),
            ..input(&project_id, "Over limit")
        };

        let ok = create(&state, at_limit).expect("creates");
        let rejected = create(&state, over_limit);

        assert_eq!(ok.columns.len(), MAX_COLUMNS_PER_BOARD);
        assert!(matches!(rejected, Err(AppError::Validation(_))));
    }

    #[test]
    fn create_in_an_unknown_project_is_not_found() {
        let (state, _) = state_with_project();

        let result = create(&state, input("missing", "Board"));

        assert!(matches!(result, Err(AppError::NotFound(_))));
        assert_eq!(count(&state, "boards"), 0);
    }

    #[test]
    fn create_logs_one_board_entry_and_none_for_the_default_columns() {
        let (state, project_id) = state_with_project();

        let details = create_named(&state, &project_id, "Sprint");

        let logged = entries(&state);
        assert_eq!(logged.len(), 1);
        assert_eq!(logged[0].entity_type, EntityType::Board);
        assert_eq!(logged[0].entity_id, details.board.id);
        assert_eq!(logged[0].action, ActivityAction::Created);
        let changes = logged[0].changes.as_ref().expect("has changes");
        assert_eq!(changes["name"].to.as_deref(), Some("Sprint"));
    }

    #[test]
    fn a_failing_activity_write_leaves_no_board_behind() {
        let (state, project_id) = state_with_project();
        state
            .database()
            .execute_batch("DROP TABLE activity_log;")
            .expect("drops log table");

        let result = create(&state, input(&project_id, "Ghost"));

        assert!(result.is_err());
        assert_eq!(count(&state, "boards"), 0);
        assert_eq!(count(&state, "columns"), 0);
    }

    #[test]
    fn get_reports_task_counts_per_column() {
        let (state, project_id) = state_with_project();
        let details = create_named(&state, &project_id, "Sprint");
        let todo = details.columns[1].id.clone();
        seed_task(&state, "t1", &details.board.id, &todo);
        seed_task(&state, "t2", &details.board.id, &todo);

        let reloaded = get(&state, &details.board.id).expect("reads");

        let counts: Vec<u32> = reloaded
            .columns
            .iter()
            .map(|column| column.task_count)
            .collect();
        assert_eq!(counts, [0, 2, 0, 0, 0]);
    }

    #[test]
    fn get_of_unknown_board_is_not_found() {
        let (state, _) = state_with_project();

        assert!(matches!(get(&state, "missing"), Err(AppError::NotFound(_))));
    }

    #[test]
    fn update_renames_trims_and_bumps_updated_at() {
        let (state, project_id) = state_with_project();
        let created = create_named(&state, &project_id, "Old").board;
        std::thread::sleep(Duration::from_millis(3));

        let updated = update(
            &state,
            &created.id,
            UpdateBoardInput {
                name: Some(" New ".into()),
            },
        )
        .expect("updates");

        assert_eq!(updated.name, "New");
        assert!(updated.updated_at > created.updated_at);
        assert_eq!(updated.created_at, created.created_at);
        assert_eq!(get(&state, &created.id).expect("reads").board, updated);
    }

    #[test]
    fn update_logs_the_name_change_and_ignores_no_ops() {
        let (state, project_id) = state_with_project();
        let created = create_named(&state, &project_id, "Old").board;

        update(
            &state,
            &created.id,
            UpdateBoardInput {
                name: Some("Old".into()),
            },
        )
        .expect("no-op");
        update(&state, &created.id, UpdateBoardInput::default()).expect("empty patch");
        update(
            &state,
            &created.id,
            UpdateBoardInput {
                name: Some("New".into()),
            },
        )
        .expect("renames");

        let logged = entries(&state);
        assert_eq!(logged.len(), 2);
        assert_eq!(logged[1].action, ActivityAction::Updated);
        let changes = logged[1].changes.as_ref().expect("has changes");
        assert_eq!(changes["name"].from.as_deref(), Some("Old"));
        assert_eq!(changes["name"].to.as_deref(), Some("New"));
    }

    #[test]
    fn update_rejects_blank_name_and_unknown_board() {
        let (state, project_id) = state_with_project();
        let created = create_named(&state, &project_id, "Keep").board;

        let blank = update(
            &state,
            &created.id,
            UpdateBoardInput {
                name: Some("  ".into()),
            },
        );
        let unknown = update(&state, "missing", UpdateBoardInput::default());

        assert!(matches!(blank, Err(AppError::Validation(_))));
        assert!(matches!(unknown, Err(AppError::NotFound(_))));
        assert_eq!(get(&state, &created.id).expect("reads").board, created);
    }

    #[test]
    fn delete_removes_the_board_and_its_columns_only() {
        let (state, project_id) = state_with_project();
        let doomed = create_named(&state, &project_id, "Doomed");
        let kept = create_named(&state, &project_id, "Kept");

        delete(&state, &doomed.board.id).expect("deletes");

        assert!(matches!(
            get(&state, &doomed.board.id),
            Err(AppError::NotFound(_))
        ));
        assert_eq!(get(&state, &kept.board.id).expect("reads"), kept);
        assert_eq!(count(&state, "boards"), 1);
        assert_eq!(count(&state, "columns"), 5);
    }

    #[test]
    fn delete_sends_every_task_of_the_board_to_the_backlog() {
        let (state, project_id) = state_with_project();
        let doomed = create_named(&state, &project_id, "Doomed");
        let kept = create_named(&state, &project_id, "Kept");
        seed_task(&state, "t1", &doomed.board.id, &doomed.columns[0].id);
        seed_task(&state, "t2", &doomed.board.id, &doomed.columns[4].id);
        seed_task(&state, "other", &kept.board.id, &kept.columns[0].id);
        state
            .database()
            .execute("UPDATE tasks SET archived_at = ?1 WHERE id = 't2'", [NOW])
            .expect("archives");

        delete(&state, &doomed.board.id).expect("deletes");

        let placements: Vec<(String, Option<String>, Option<String>)> = {
            let connection = state.database();
            let mut statement = connection
                .prepare("SELECT id, board_id, column_id FROM tasks ORDER BY id")
                .expect("prepares");
            statement
                .query_map([], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)))
                .expect("queries")
                .collect::<Result<_, _>>()
                .expect("reads")
        };
        assert_eq!(count(&state, "tasks"), 3);
        assert_eq!(
            placements[0],
            (
                "other".into(),
                Some(kept.board.id.clone()),
                Some(kept.columns[0].id.clone())
            )
        );
        assert_eq!(placements[1], ("t1".into(), None, None));
        assert_eq!(placements[2], ("t2".into(), None, None));
    }

    #[test]
    fn delete_logs_each_task_move_and_the_board_deletion() {
        let (state, project_id) = state_with_project();
        let doomed = create_named(&state, &project_id, "Doomed");
        seed_task(&state, "t1", &doomed.board.id, &doomed.columns[0].id);

        delete(&state, &doomed.board.id).expect("deletes");

        let logged = entries(&state);
        assert_eq!(logged.len(), 3);
        assert_eq!(logged[1].entity_type, EntityType::Task);
        assert_eq!(logged[1].entity_id, "t1");
        assert_eq!(logged[1].action, ActivityAction::Moved);
        let moved = logged[1].changes.as_ref().expect("has changes");
        assert_eq!(moved["board"].from.as_deref(), Some("Doomed"));
        assert_eq!(moved["board"].to, None);
        assert_eq!(logged[2].entity_type, EntityType::Board);
        assert_eq!(logged[2].action, ActivityAction::Deleted);
        let deleted = logged[2].changes.as_ref().expect("has changes");
        assert_eq!(deleted["name"].from.as_deref(), Some("Doomed"));
    }

    #[test]
    fn delete_of_unknown_board_is_not_found_and_logs_nothing() {
        let (state, _) = state_with_project();

        let result = delete(&state, "missing");

        assert!(matches!(result, Err(AppError::NotFound(_))));
        assert!(entries(&state).is_empty());
    }

    #[test]
    fn a_failing_activity_write_keeps_the_board_and_its_tasks_in_place() {
        let (state, project_id) = state_with_project();
        let board = create_named(&state, &project_id, "Survivor");
        seed_task(&state, "t1", &board.board.id, &board.columns[0].id);
        state
            .database()
            .execute_batch("DROP TABLE activity_log;")
            .expect("drops log table");

        let result = delete(&state, &board.board.id);

        assert!(result.is_err());
        let reloaded = get(&state, &board.board.id).expect("board still exists");
        assert_eq!(reloaded.columns[0].task_count, 1);
    }
}
