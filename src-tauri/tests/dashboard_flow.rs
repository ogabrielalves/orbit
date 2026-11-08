#![allow(clippy::expect_used)]

use orbit_lib::bootstrap::initialize_state;
use orbit_lib::modules::boards::models::{BoardDetails, CreateBoardInput};
use orbit_lib::modules::boards::{column_service, service as boards};
use orbit_lib::modules::dashboard::models::{DashboardSummary, DashboardSummaryInput};
use orbit_lib::modules::dashboard::service as dashboard;
use orbit_lib::modules::projects::models::CreateProjectInput;
use orbit_lib::modules::projects::service as projects;
use orbit_lib::state::AppState;

const NOW: &str = "2026-11-08T10:00:00.000Z";
const TODAY: &str = "2026-11-08";

fn create_project(state: &AppState, name: &str) -> String {
    let input = CreateProjectInput {
        name: name.into(),
        description: None,
        icon: None,
        color: None,
    };
    projects::create(state, input).expect("creates project").id
}

fn create_board(state: &AppState, project_id: &str) -> BoardDetails {
    let input = CreateBoardInput {
        project_id: project_id.into(),
        name: "Board".into(),
        column_names: None,
    };
    boards::create(state, input).expect("creates board")
}

fn add_task(
    state: &AppState,
    project_id: &str,
    id: &str,
    placement: Option<(&str, &str)>,
    due_date: Option<&str>,
) {
    let (board_id, column_id) = match placement {
        Some((board, column)) => (Some(board), Some(column)),
        None => (None, None),
    };
    state
        .database()
        .execute(
            "INSERT INTO tasks (id, project_id, board_id, column_id, title, due_date, position, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?1, ?5, 'V', ?6, ?6)",
            (id, project_id, board_id, column_id, due_date, NOW),
        )
        .expect("adds task");
}

fn summary(state: &AppState) -> DashboardSummary {
    let input = DashboardSummaryInput {
        today: Some(TODAY.into()),
        ..Default::default()
    };
    dashboard::summary(state, input).expect("summarizes")
}

#[test]
fn the_summary_follows_project_board_and_column_changes_and_survives_a_restart() {
    let directory = tempfile::tempdir().expect("temp dir");
    let state = initialize_state(directory.path()).expect("starts");
    let project = create_project(&state, "Website");
    let other = create_project(&state, "Docs");
    let board = create_board(&state, &project);
    let first_column = (board.board.id.as_str(), board.columns[0].id.as_str());
    let done = (board.board.id.as_str(), board.columns[4].id.as_str());
    add_task(
        &state,
        &project,
        "t-first",
        Some(first_column),
        Some("2026-11-10"),
    );
    add_task(&state, &project, "t-done", Some(done), Some("2026-11-10"));
    add_task(&state, &project, "t-idea", None, Some("2026-11-09"));
    add_task(&state, &other, "t-other", None, None);

    let initial = summary(&state);

    assert_eq!(initial.active_project_count, 2);
    assert_eq!(initial.tasks.total, 4);
    assert_eq!(initial.tasks.backlog, 2);
    assert_eq!(initial.tasks.pending, 1);
    assert_eq!(initial.tasks.completed, 1);
    let upcoming: Vec<&str> = initial
        .upcoming_tasks
        .iter()
        .map(|task| task.task_id.as_str())
        .collect();
    assert_eq!(upcoming, ["t-idea", "t-first"]);
    drop(state);

    let restarted = initialize_state(directory.path()).expect("restarts");
    assert_eq!(summary(&restarted), initial);
}

#[test]
fn archiving_a_project_removes_its_tasks_from_the_summary() {
    let directory = tempfile::tempdir().expect("temp dir");
    let state = initialize_state(directory.path()).expect("starts");
    let keep = create_project(&state, "Keep");
    let shelve = create_project(&state, "Shelve");
    add_task(&state, &keep, "kept", None, Some("2026-11-09"));
    add_task(&state, &shelve, "shelved", None, Some("2026-11-09"));
    let before = summary(&state);

    projects::archive(&state, &shelve).expect("archives");
    let archived = summary(&state);
    projects::restore(&state, &shelve).expect("restores");
    let restored = summary(&state);

    assert_eq!(before.tasks.total, 2);
    assert_eq!(archived.tasks.total, 1);
    assert_eq!(archived.active_project_count, 1);
    assert_eq!(archived.upcoming_tasks.len(), 1);
    assert_eq!(restored, before);
}

#[test]
fn deleting_a_board_turns_its_tasks_into_backlog_in_the_summary() {
    let directory = tempfile::tempdir().expect("temp dir");
    let state = initialize_state(directory.path()).expect("starts");
    let project = create_project(&state, "P");
    let board = create_board(&state, &project);
    let in_progress = (board.board.id.as_str(), board.columns[2].id.as_str());
    add_task(&state, &project, "t1", Some(in_progress), None);
    add_task(&state, &project, "t2", Some(in_progress), None);
    let before = summary(&state).tasks;

    boards::delete(&state, &board.board.id).expect("deletes board");
    let after = summary(&state).tasks;

    assert_eq!((before.in_progress, before.backlog), (2, 0));
    assert_eq!((after.in_progress, after.backlog), (0, 2));
    assert_eq!(after.total, before.total);
}

#[test]
fn moving_the_done_column_changes_what_counts_as_completed() {
    let directory = tempfile::tempdir().expect("temp dir");
    let state = initialize_state(directory.path()).expect("starts");
    let project = create_project(&state, "P");
    let board = create_board(&state, &project);
    let last = board.columns[4].id.clone();
    add_task(
        &state,
        &project,
        "t1",
        Some((board.board.id.as_str(), last.as_str())),
        None,
    );
    let before = summary(&state).tasks;

    column_service::move_column(&state, &last, None).expect("moves Done first");
    let after = summary(&state).tasks;

    assert_eq!((before.completed, before.pending), (1, 0));
    assert_eq!((after.completed, after.pending), (0, 1));
}
