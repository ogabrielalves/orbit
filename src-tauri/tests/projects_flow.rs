use orbit_lib::bootstrap::initialize_state;
use orbit_lib::error::AppError;
use orbit_lib::modules::activity::models::ActivityAction;
use orbit_lib::modules::activity::service as activity;
use orbit_lib::modules::projects::models::{
    CreateProjectInput, ListProjectsInput, ProjectScope, ProjectStatus, UpdateProjectInput,
};
use orbit_lib::modules::projects::service;
use orbit_lib::state::AppState;

const NOW: &str = "2026-11-08T10:00:00.000Z";

fn create_input(name: &str) -> CreateProjectInput {
    CreateProjectInput {
        name: name.into(),
        description: Some("about".into()),
        icon: Some("rocket".into()),
        color: Some("#123456".into()),
    }
}

fn seed_task_with_attachment(
    state: &AppState,
    project_id: &str,
    task_id: &str,
    stored_name: &str,
) -> rusqlite::Result<()> {
    let connection = state.database();
    connection.execute(
        "INSERT INTO tasks (id, project_id, title, position, created_at, updated_at) VALUES (?1, ?2, 'T', 'V', ?3, ?3)",
        (task_id, project_id, NOW),
    )?;
    connection.execute(
        "INSERT INTO attachments (id, task_id, file_name, stored_name, mime_type, size_bytes, created_at) VALUES (?1, ?2, 'f', ?3, 'text/plain', 4, ?4)",
        (format!("a-{task_id}"), task_id, stored_name, NOW),
    )?;
    Ok(())
}

#[test]
fn projects_survive_a_restart_with_their_archive_state_and_status() {
    let directory = tempfile::tempdir().expect("temp dir");
    let first_run = initialize_state(directory.path()).expect("first start");
    let live = service::create(&first_run, create_input("Live")).expect("creates");
    let shelved = service::create(&first_run, create_input("Shelved")).expect("creates");
    let patch = UpdateProjectInput {
        status: Some(ProjectStatus::Paused),
        ..Default::default()
    };
    service::update(&first_run, &live.id, patch).expect("updates");
    service::archive(&first_run, &shelved.id).expect("archives");
    drop(first_run);

    let second_run = initialize_state(directory.path()).expect("second start");

    let active = service::list(&second_run, ListProjectsInput::default()).expect("lists");
    let archived = service::list(
        &second_run,
        ListProjectsInput {
            scope: ProjectScope::Archived,
            ..Default::default()
        },
    )
    .expect("lists");
    assert_eq!(active.len(), 1);
    assert_eq!(active[0].id, live.id);
    assert_eq!(active[0].status, ProjectStatus::Paused);
    assert_eq!(active[0].icon.as_deref(), Some("rocket"));
    assert_eq!(archived.len(), 1);
    assert_eq!(archived[0].id, shelved.id);
}

#[test]
fn restored_project_comes_back_to_the_active_list_after_a_restart() {
    let directory = tempfile::tempdir().expect("temp dir");
    let first_run = initialize_state(directory.path()).expect("first start");
    let project = service::create(&first_run, create_input("Back")).expect("creates");
    service::archive(&first_run, &project.id).expect("archives");
    service::restore(&first_run, &project.id).expect("restores");
    drop(first_run);

    let second_run = initialize_state(directory.path()).expect("second start");

    let active = service::list(&second_run, ListProjectsInput::default()).expect("lists");
    assert_eq!(active.len(), 1);
    assert_eq!(active[0].archived_at, None);
}

#[test]
fn deleting_a_project_removes_its_attachment_files_from_the_real_attachments_directory() {
    let directory = tempfile::tempdir().expect("temp dir");
    let state = initialize_state(directory.path()).expect("starts");
    let attachments = state
        .attachments_directory()
        .expect("attachments directory configured")
        .to_path_buf();
    let doomed = service::create(&state, create_input("Doomed")).expect("creates");
    let kept = service::create(&state, create_input("Kept")).expect("creates");
    seed_task_with_attachment(&state, &doomed.id, "t1", "doomed-file").expect("seeds");
    seed_task_with_attachment(&state, &kept.id, "t2", "kept-file").expect("seeds");
    std::fs::write(attachments.join("doomed-file"), "data").expect("writes");
    std::fs::write(attachments.join("kept-file"), "data").expect("writes");

    service::delete(&state, &doomed.id).expect("deletes");

    assert!(!attachments.join("doomed-file").exists());
    assert!(attachments.join("kept-file").exists());
    assert!(matches!(
        service::get(&state, &doomed.id),
        Err(AppError::NotFound(_))
    ));
    assert!(service::get(&state, &kept.id).is_ok());
}

#[test]
fn deleted_project_stays_deleted_after_a_restart() {
    let directory = tempfile::tempdir().expect("temp dir");
    let first_run = initialize_state(directory.path()).expect("first start");
    let project = service::create(&first_run, create_input("Gone")).expect("creates");
    service::delete(&first_run, &project.id).expect("deletes");
    drop(first_run);

    let second_run = initialize_state(directory.path()).expect("second start");

    let all = service::list(
        &second_run,
        ListProjectsInput {
            scope: ProjectScope::All,
            ..Default::default()
        },
    )
    .expect("lists");
    assert!(all.is_empty());
}

#[test]
fn project_history_survives_a_restart_and_the_deletion_of_the_project() {
    let directory = tempfile::tempdir().expect("temp dir");
    let first_run = initialize_state(directory.path()).expect("first start");
    let project = service::create(&first_run, create_input("History")).expect("creates");
    let patch = UpdateProjectInput {
        name: Some("History v2".into()),
        ..Default::default()
    };
    service::update(&first_run, &project.id, patch).expect("updates");
    service::archive(&first_run, &project.id).expect("archives");
    service::delete(&first_run, &project.id).expect("deletes");
    drop(first_run);

    let second_run = initialize_state(directory.path()).expect("second start");

    let mut entries = activity::recent(&second_run, None).expect("reads");
    entries.reverse();
    let actions: Vec<ActivityAction> = entries.iter().map(|entry| entry.action).collect();
    assert_eq!(
        actions,
        [
            ActivityAction::Created,
            ActivityAction::Updated,
            ActivityAction::Archived,
            ActivityAction::Deleted
        ]
    );
    assert!(entries.iter().all(|entry| entry.entity_id == project.id));
}
