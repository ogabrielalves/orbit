#![allow(clippy::expect_used)]

use orbit_lib::bootstrap::{ATTACHMENTS_DIRECTORY_NAME, initialize_state};
use orbit_lib::error::AppError;
use orbit_lib::modules::activity::models::{ActivityAction, EntityType};
use orbit_lib::modules::activity::service as activity;
use orbit_lib::modules::attachments::service as attachments;
use orbit_lib::modules::projects::models::CreateProjectInput;
use orbit_lib::modules::projects::service as projects;
use orbit_lib::modules::tasks::models::{CreateTaskInput, Task};
use orbit_lib::modules::tasks::{duplicate_service as duplicates, service as tasks};
use orbit_lib::state::AppState;

fn create_project(state: &AppState) -> String {
    projects::create(
        state,
        CreateProjectInput {
            name: "P".into(),
            description: None,
            icon: None,
            color: None,
        },
    )
    .expect("creates project")
    .id
}

fn create_task(state: &AppState, project_id: &str) -> Task {
    tasks::create(
        state,
        CreateTaskInput {
            project_id: project_id.into(),
            title: "T".into(),
            description: None,
            priority: None,
            due_date: None,
            column_id: None,
        },
    )
    .expect("creates task")
}

fn source_file(directory: &std::path::Path, name: &str, content: &[u8]) -> String {
    let path = directory.join(name);
    std::fs::write(&path, content).expect("writes source");
    path.to_string_lossy().into_owned()
}

fn stored_files(data_directory: &std::path::Path) -> Vec<String> {
    let mut names: Vec<String> = std::fs::read_dir(data_directory.join(ATTACHMENTS_DIRECTORY_NAME))
        .expect("reads dir")
        .map(|entry| {
            entry
                .expect("entry")
                .file_name()
                .to_string_lossy()
                .into_owned()
        })
        .collect();
    names.sort();
    names
}

#[test]
fn an_imported_attachment_and_its_file_survive_a_restart() {
    let data = tempfile::tempdir().expect("data dir");
    let sources = tempfile::tempdir().expect("sources dir");
    let first_run = initialize_state(data.path()).expect("first start");
    let task = create_task(&first_run, &create_project(&first_run));
    let source = source_file(sources.path(), "Plan.docx", b"docx-bytes");
    let imported = attachments::import(&first_run, &task.id, &source).expect("imports");
    drop(first_run);

    let second_run = initialize_state(data.path()).expect("second start");
    let listed = attachments::list(&second_run, &task.id).expect("lists");
    let path = attachments::path_for_open(&second_run, &imported.id).expect("resolves");

    assert_eq!(listed, [imported]);
    assert_eq!(std::fs::read(path).expect("reads"), b"docx-bytes");
    assert_eq!(stored_files(data.path()).len(), 1);
}

#[test]
fn removing_an_attachment_deletes_the_file_from_the_real_attachments_directory() {
    let data = tempfile::tempdir().expect("data dir");
    let sources = tempfile::tempdir().expect("sources dir");
    let state = initialize_state(data.path()).expect("starts");
    let task = create_task(&state, &create_project(&state));
    let source = source_file(sources.path(), "a.txt", b"x");
    let doomed = attachments::import(&state, &task.id, &source).expect("imports");
    let kept = attachments::import(&state, &task.id, &source).expect("imports");

    attachments::remove(&state, &doomed.id).expect("removes");

    assert_eq!(stored_files(data.path()).len(), 1);
    let remaining = attachments::list(&state, &task.id).expect("lists");
    assert_eq!(remaining, [kept]);
}

#[test]
fn deleting_the_task_or_the_project_removes_the_attachment_files() {
    let data = tempfile::tempdir().expect("data dir");
    let sources = tempfile::tempdir().expect("sources dir");
    let state = initialize_state(data.path()).expect("starts");
    let project = create_project(&state);
    let first = create_task(&state, &project);
    let second = create_task(&state, &project);
    let source = source_file(sources.path(), "a.txt", b"x");
    attachments::import(&state, &first.id, &source).expect("imports");
    attachments::import(&state, &second.id, &source).expect("imports");

    tasks::delete(&state, &first.id).expect("deletes task");
    assert_eq!(stored_files(data.path()).len(), 1);

    projects::delete(&state, &project).expect("deletes project");
    assert!(stored_files(data.path()).is_empty());
}

#[test]
fn attachment_events_show_up_in_the_task_history_and_duplicates_do_not_copy_files() {
    let data = tempfile::tempdir().expect("data dir");
    let sources = tempfile::tempdir().expect("sources dir");
    let state = initialize_state(data.path()).expect("starts");
    let task = create_task(&state, &create_project(&state));
    let source = source_file(sources.path(), "spec.pdf", b"x");
    let imported = attachments::import(&state, &task.id, &source).expect("imports");
    let copy = duplicates::duplicate(&state, &task.id, None).expect("duplicates");
    attachments::remove(&state, &imported.id).expect("removes");

    let history = activity::task_history(&state, &task.id, None).expect("reads");

    let attachment_events: Vec<ActivityAction> = history
        .iter()
        .filter(|entry| entry.entity_type == EntityType::Attachment)
        .map(|entry| entry.action)
        .collect();
    assert_eq!(
        attachment_events,
        [ActivityAction::Deleted, ActivityAction::Created]
    );
    assert!(
        attachments::list(&state, &copy.id)
            .expect("lists")
            .is_empty()
    );
}

#[test]
fn rejected_imports_leave_the_directory_clean() {
    let data = tempfile::tempdir().expect("data dir");
    let sources = tempfile::tempdir().expect("sources dir");
    let state = initialize_state(data.path()).expect("starts");
    let task = create_task(&state, &create_project(&state));
    let program = source_file(sources.path(), "installer.exe", b"MZ");

    let result = attachments::import(&state, &task.id, &program);

    assert!(matches!(result, Err(AppError::Validation(_))));
    assert!(stored_files(data.path()).is_empty());
}
