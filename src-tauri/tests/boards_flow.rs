#![allow(clippy::expect_used)]

use orbit_lib::bootstrap::initialize_state;
use orbit_lib::error::AppError;
use orbit_lib::modules::activity::models::{ActivityAction, EntityType};
use orbit_lib::modules::activity::service as activity;
use orbit_lib::modules::boards::models::{
    BoardDetails, ColumnKind, CreateBoardInput, CreateColumnInput, NewColumn, UpdateBoardInput,
    UpdateColumnInput,
};
use orbit_lib::modules::boards::{column_service, service};
use orbit_lib::modules::projects::models::CreateProjectInput;
use orbit_lib::modules::projects::service as projects;
use orbit_lib::state::AppState;

const NOW: &str = "2026-11-08T10:00:00.000Z";

fn create_project(state: &AppState, name: &str) -> String {
    let input = CreateProjectInput {
        name: name.into(),
        description: None,
        icon: None,
        color: None,
    };
    projects::create(state, input).expect("creates project").id
}

fn create_board(state: &AppState, project_id: &str, columns: &[&str]) -> BoardDetails {
    let input = CreateBoardInput {
        project_id: project_id.into(),
        name: "Sprint".into(),
        columns: Some(
            columns
                .iter()
                .map(|name| NewColumn::new(name, ColumnKind::InProgress))
                .collect(),
        ),
    };
    service::create(state, input).expect("creates board")
}

fn column_names(details: &BoardDetails) -> Vec<&str> {
    details
        .columns
        .iter()
        .map(|column| column.name.as_str())
        .collect()
}

fn seed_task(
    state: &AppState,
    project_id: &str,
    task_id: &str,
    placement: Option<(&str, &str)>,
) -> rusqlite::Result<()> {
    let (board_id, column_id) = match placement {
        Some((board, column)) => (Some(board), Some(column)),
        None => (None, None),
    };
    state.database().execute(
        "INSERT INTO tasks (id, project_id, board_id, column_id, title, position, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, 'T', 'V', ?5, ?5)",
        (task_id, project_id, board_id, column_id, NOW),
    )?;
    Ok(())
}

#[test]
fn board_columns_keep_their_order_and_names_after_a_restart() {
    let directory = tempfile::tempdir().expect("temp dir");
    let first_run = initialize_state(directory.path()).expect("first start");
    let project_id = create_project(&first_run, "P");
    let board = create_board(&first_run, &project_id, &["A", "B", "C"]);
    let c = board.columns[2].id.clone();
    column_service::move_column(&first_run, &c, None).expect("moves C first");
    let extra = CreateColumnInput {
        board_id: board.board.id.clone(),
        name: "D".into(),
        color: Some("#123456".into()),
        kind: Some(ColumnKind::Done),
    };
    column_service::create(&first_run, extra).expect("adds D");
    let rename = UpdateColumnInput {
        name: Some("A2".into()),
        kind: Some(ColumnKind::Todo),
        ..Default::default()
    };
    column_service::update(&first_run, &board.columns[0].id, rename).expect("renames A");
    drop(first_run);

    let second_run = initialize_state(directory.path()).expect("second start");

    let reloaded = service::get(&second_run, &board.board.id).expect("reads");
    assert_eq!(column_names(&reloaded), ["C", "A2", "B", "D"]);
    assert_eq!(reloaded.columns[3].color.as_deref(), Some("#123456"));
    let kinds: Vec<ColumnKind> = reloaded.columns.iter().map(|column| column.kind).collect();
    assert_eq!(
        kinds,
        [
            ColumnKind::InProgress,
            ColumnKind::Todo,
            ColumnKind::InProgress,
            ColumnKind::Done
        ]
    );
}

#[test]
fn deleting_a_project_removes_its_boards_and_columns() {
    let directory = tempfile::tempdir().expect("temp dir");
    let state = initialize_state(directory.path()).expect("starts");
    let doomed = create_project(&state, "Doomed");
    let kept = create_project(&state, "Kept");
    let doomed_board = create_board(&state, &doomed, &["A", "B"]);
    let kept_board = create_board(&state, &kept, &["X"]);
    seed_task(
        &state,
        &doomed,
        "t1",
        Some((&doomed_board.board.id, &doomed_board.columns[0].id)),
    )
    .expect("seeds task");

    projects::delete(&state, &doomed).expect("deletes project");

    assert!(matches!(
        service::get(&state, &doomed_board.board.id),
        Err(AppError::NotFound(_))
    ));
    assert_eq!(
        service::get(&state, &kept_board.board.id).expect("reads"),
        kept_board
    );
}

#[test]
fn deleting_a_board_keeps_its_tasks_in_the_backlog_across_a_restart() {
    let directory = tempfile::tempdir().expect("temp dir");
    let first_run = initialize_state(directory.path()).expect("first start");
    let project_id = create_project(&first_run, "P");
    let board = create_board(&first_run, &project_id, &["Todo"]);
    seed_task(
        &first_run,
        &project_id,
        "t1",
        Some((&board.board.id, &board.columns[0].id)),
    )
    .expect("seeds task");
    service::delete(&first_run, &board.board.id).expect("deletes board");
    drop(first_run);

    let second_run = initialize_state(directory.path()).expect("second start");

    let placement: (Option<String>, Option<String>) = second_run
        .database()
        .query_row(
            "SELECT board_id, column_id FROM tasks WHERE id = 't1'",
            [],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .expect("task survives");
    assert_eq!(placement, (None, None));
}

#[test]
fn a_non_empty_column_cannot_be_deleted_until_its_task_leaves() {
    let directory = tempfile::tempdir().expect("temp dir");
    let state = initialize_state(directory.path()).expect("starts");
    let project_id = create_project(&state, "P");
    let board = create_board(&state, &project_id, &["From", "To"]);
    let from = board.columns[0].id.clone();
    seed_task(&state, &project_id, "t1", Some((&board.board.id, &from))).expect("seeds task");

    let blocked = column_service::delete(&state, &from);
    state
        .database()
        .execute(
            "UPDATE tasks SET column_id = ?1 WHERE id = 't1'",
            [&board.columns[1].id],
        )
        .expect("moves task");
    let allowed = column_service::delete(&state, &from);

    assert!(matches!(blocked, Err(AppError::Conflict(_))));
    assert!(allowed.is_ok());
    let reloaded = service::get(&state, &board.board.id).expect("reads");
    assert_eq!(column_names(&reloaded), ["To"]);
    assert_eq!(reloaded.columns[0].task_count, 1);
}

#[test]
fn board_and_column_history_is_recorded_and_survives_a_restart() {
    let directory = tempfile::tempdir().expect("temp dir");
    let first_run = initialize_state(directory.path()).expect("first start");
    let project_id = create_project(&first_run, "P");
    let board = create_board(&first_run, &project_id, &["A", "B"]);
    let rename_board = UpdateBoardInput {
        name: Some("Sprint 2".into()),
    };
    service::update(&first_run, &board.board.id, rename_board).expect("renames board");
    column_service::move_column(&first_run, &board.columns[1].id, None).expect("moves B");
    column_service::delete(&first_run, &board.columns[0].id).expect("deletes A");
    service::delete(&first_run, &board.board.id).expect("deletes board");
    drop(first_run);

    let second_run = initialize_state(directory.path()).expect("second start");

    let mut entries = activity::recent(&second_run, None).expect("reads");
    entries.reverse();
    let history: Vec<(EntityType, ActivityAction)> = entries
        .iter()
        .filter(|entry| entry.entity_type != EntityType::Project)
        .map(|entry| (entry.entity_type, entry.action))
        .collect();
    assert_eq!(
        history,
        [
            (EntityType::Board, ActivityAction::Created),
            (EntityType::Board, ActivityAction::Updated),
            (EntityType::Column, ActivityAction::Moved),
            (EntityType::Column, ActivityAction::Deleted),
            (EntityType::Board, ActivityAction::Deleted),
        ]
    );
}
