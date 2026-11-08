#![allow(clippy::expect_used)]

use orbit_lib::bootstrap::initialize_state;
use orbit_lib::error::AppError;
use orbit_lib::modules::activity::models::{ActivityAction, EntityType};
use orbit_lib::modules::activity::service as activity;
use orbit_lib::modules::boards::models::{BoardDetails, CreateBoardInput};
use orbit_lib::modules::boards::{column_service, service as boards};
use orbit_lib::modules::dashboard::models::DashboardSummaryInput;
use orbit_lib::modules::dashboard::service as dashboard;
use orbit_lib::modules::projects::models::CreateProjectInput;
use orbit_lib::modules::projects::service as projects;
use orbit_lib::modules::tasks::models::{CreateTaskInput, Task, UpdateTaskInput};
use orbit_lib::modules::tasks::{placement_service, service as tasks};
use orbit_lib::state::AppState;

fn create_project(state: &AppState) -> String {
    let input = CreateProjectInput {
        name: "P".into(),
        description: None,
        icon: None,
        color: None,
    };
    projects::create(state, input).expect("creates project").id
}

fn create_board(state: &AppState, project_id: &str) -> BoardDetails {
    let input = CreateBoardInput {
        project_id: project_id.into(),
        name: "Sprint".into(),
        column_names: Some(vec!["Todo".into(), "Doing".into(), "Done".into()]),
    };
    boards::create(state, input).expect("creates board")
}

fn create_task(state: &AppState, project_id: &str, title: &str, column: Option<&str>) -> Task {
    let input = CreateTaskInput {
        project_id: project_id.into(),
        title: title.into(),
        description: None,
        priority: None,
        due_date: None,
        column_id: column.map(str::to_string),
    };
    tasks::create(state, input).expect("creates task")
}

fn titles(state: &AppState, board_id: &str, column_id: &str) -> Vec<String> {
    tasks::list_by_board(state, board_id)
        .expect("lists")
        .into_iter()
        .filter(|task| task.column_id.as_deref() == Some(column_id))
        .map(|task| task.title)
        .collect()
}

#[test]
fn board_order_and_placement_survive_a_restart() {
    let directory = tempfile::tempdir().expect("temp dir");
    let first_run = initialize_state(directory.path()).expect("first start");
    let project_id = create_project(&first_run);
    let board = create_board(&first_run, &project_id);
    let (todo, doing) = (board.columns[0].id.clone(), board.columns[1].id.clone());
    let a = create_task(&first_run, &project_id, "A", Some(&todo));
    let b = create_task(&first_run, &project_id, "B", Some(&todo));
    let c = create_task(&first_run, &project_id, "C", Some(&todo));
    let idea = create_task(&first_run, &project_id, "Idea", None);
    placement_service::move_task(&first_run, &c.id, &todo, None).expect("C first");
    placement_service::move_task(&first_run, &b.id, &doing, None).expect("B to doing");
    placement_service::send_to_board(&first_run, &idea.id, &board.board.id, Some(doing.clone()))
        .expect("idea to doing");
    placement_service::move_task(&first_run, &a.id, &doing, Some(b.id.clone())).expect("A after B");
    drop(first_run);

    let second_run = initialize_state(directory.path()).expect("second start");

    assert_eq!(titles(&second_run, &board.board.id, &todo), ["C"]);
    assert_eq!(
        titles(&second_run, &board.board.id, &doing),
        ["B", "A", "Idea"]
    );
}

#[test]
fn task_updates_and_archive_state_survive_a_restart() {
    let directory = tempfile::tempdir().expect("temp dir");
    let first_run = initialize_state(directory.path()).expect("first start");
    let project_id = create_project(&first_run);
    let kept = create_task(&first_run, &project_id, "Kept", None);
    let shelved = create_task(&first_run, &project_id, "Shelved", None);
    let patch = UpdateTaskInput {
        title: Some("Kept v2".into()),
        due_date: Some(Some("2026-12-24".into())),
        ..Default::default()
    };
    tasks::update(&first_run, &kept.id, patch).expect("updates");
    tasks::archive(&first_run, &shelved.id).expect("archives");
    drop(first_run);

    let second_run = initialize_state(directory.path()).expect("second start");

    let reloaded = tasks::get(&second_run, &kept.id).expect("reads");
    assert_eq!(reloaded.title, "Kept v2");
    assert_eq!(reloaded.due_date.as_deref(), Some("2026-12-24"));
    assert!(
        tasks::get(&second_run, &shelved.id)
            .expect("reads")
            .archived_at
            .is_some()
    );
}

#[test]
fn deleting_a_task_removes_its_attachment_files_from_the_real_attachments_directory() {
    let directory = tempfile::tempdir().expect("temp dir");
    let state = initialize_state(directory.path()).expect("starts");
    let attachments = state
        .attachments_directory()
        .expect("attachments directory configured")
        .to_path_buf();
    let project_id = create_project(&state);
    let doomed = create_task(&state, &project_id, "Doomed", None);
    let kept = create_task(&state, &project_id, "Kept", None);
    for (id, task, stored) in [
        ("a1", &doomed.id, "doomed-file"),
        ("a2", &kept.id, "kept-file"),
    ] {
        state
            .database()
            .execute(
                "INSERT INTO attachments (id, task_id, file_name, stored_name, mime_type, size_bytes, created_at) VALUES (?1, ?2, 'f', ?3, 'text/plain', 4, '2026-11-08T10:00:00.000Z')",
                (id, task, stored),
            )
            .expect("attachment row");
        std::fs::write(attachments.join(stored), "data").expect("writes file");
    }

    tasks::delete(&state, &doomed.id).expect("deletes");

    assert!(!attachments.join("doomed-file").exists());
    assert!(attachments.join("kept-file").exists());
    assert!(matches!(
        tasks::get(&state, &doomed.id),
        Err(AppError::NotFound(_))
    ));
}

#[test]
fn deleting_a_board_sends_tasks_to_the_backlog_where_they_can_be_sent_to_another_board() {
    let directory = tempfile::tempdir().expect("temp dir");
    let state = initialize_state(directory.path()).expect("starts");
    let project_id = create_project(&state);
    let old_board = create_board(&state, &project_id);
    let new_board = create_board(&state, &project_id);
    let task = create_task(
        &state,
        &project_id,
        "Survivor",
        Some(&old_board.columns[0].id),
    );

    boards::delete(&state, &old_board.board.id).expect("deletes board");
    let orphaned = tasks::get(&state, &task.id).expect("task survives");
    placement_service::send_to_board(&state, &task.id, &new_board.board.id, None)
        .expect("re-sends");

    assert_eq!((orphaned.board_id, orphaned.column_id), (None, None));
    assert_eq!(
        titles(&state, &new_board.board.id, &new_board.columns[0].id),
        ["Survivor"]
    );
}

#[test]
fn a_column_with_tasks_cannot_be_deleted_until_the_tasks_are_moved_out_by_the_task_commands() {
    let directory = tempfile::tempdir().expect("temp dir");
    let state = initialize_state(directory.path()).expect("starts");
    let project_id = create_project(&state);
    let board = create_board(&state, &project_id);
    let (todo, doing) = (board.columns[0].id.clone(), board.columns[1].id.clone());
    let task = create_task(&state, &project_id, "T", Some(&todo));

    let blocked = column_service::delete(&state, &todo);
    placement_service::move_task(&state, &task.id, &doing, None).expect("moves out");
    let allowed = column_service::delete(&state, &todo);

    assert!(matches!(blocked, Err(AppError::Conflict(_))));
    assert!(allowed.is_ok());
}

#[test]
fn the_dashboard_follows_task_moves_and_archiving() {
    let directory = tempfile::tempdir().expect("temp dir");
    let state = initialize_state(directory.path()).expect("starts");
    let project_id = create_project(&state);
    let board = create_board(&state, &project_id);
    let (todo, done) = (board.columns[0].id.clone(), board.columns[2].id.clone());
    let task = create_task(&state, &project_id, "T", Some(&todo));
    let input = || DashboardSummaryInput {
        today: Some("2026-11-08".into()),
        ..Default::default()
    };

    let pending = dashboard::summary(&state, input())
        .expect("summarizes")
        .tasks;
    placement_service::move_task(&state, &task.id, &done, None).expect("moves to done");
    let completed = dashboard::summary(&state, input())
        .expect("summarizes")
        .tasks;
    tasks::archive(&state, &task.id).expect("archives");
    let archived = dashboard::summary(&state, input())
        .expect("summarizes")
        .tasks;

    assert_eq!((pending.pending, pending.completed), (1, 0));
    assert_eq!((completed.pending, completed.completed), (0, 1));
    assert_eq!(archived.total, 0);
}

#[test]
fn task_history_is_recorded_in_order_and_survives_a_restart() {
    let directory = tempfile::tempdir().expect("temp dir");
    let first_run = initialize_state(directory.path()).expect("first start");
    let project_id = create_project(&first_run);
    let board = create_board(&first_run, &project_id);
    let task = create_task(&first_run, &project_id, "History", None);
    tasks::update(
        &first_run,
        &task.id,
        UpdateTaskInput {
            title: Some("History v2".into()),
            ..Default::default()
        },
    )
    .expect("updates");
    placement_service::send_to_board(&first_run, &task.id, &board.board.id, None).expect("sends");
    placement_service::move_task(&first_run, &task.id, &board.columns[1].id, None).expect("moves");
    tasks::archive(&first_run, &task.id).expect("archives");
    tasks::restore(&first_run, &task.id).expect("restores");
    placement_service::send_to_backlog(&first_run, &task.id).expect("returns");
    tasks::delete(&first_run, &task.id).expect("deletes");
    drop(first_run);

    let second_run = initialize_state(directory.path()).expect("second start");

    let mut entries = activity::recent(&second_run, Some(100)).expect("reads");
    entries.reverse();
    let history: Vec<ActivityAction> = entries
        .iter()
        .filter(|entry| entry.entity_type == EntityType::Task && entry.entity_id == task.id)
        .map(|entry| entry.action)
        .collect();
    assert_eq!(
        history,
        [
            ActivityAction::Created,
            ActivityAction::Updated,
            ActivityAction::Moved,
            ActivityAction::Moved,
            ActivityAction::Archived,
            ActivityAction::Restored,
            ActivityAction::Moved,
            ActivityAction::Deleted
        ]
    );
}
