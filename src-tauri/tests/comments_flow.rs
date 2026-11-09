#![allow(clippy::expect_used)]

use orbit_lib::bootstrap::initialize_state;
use orbit_lib::error::AppError;
use orbit_lib::modules::comments::models::CreateCommentInput;
use orbit_lib::modules::comments::service as comments;
use orbit_lib::modules::projects::models::CreateProjectInput;
use orbit_lib::modules::projects::service as projects;
use orbit_lib::modules::tasks::models::{CreateTaskInput, Task};
use orbit_lib::modules::tasks::service as tasks;
use orbit_lib::state::AppState;

fn create_task(state: &AppState) -> Task {
    let project = projects::create(
        state,
        CreateProjectInput {
            name: "P".into(),
            description: None,
            icon: None,
            color: None,
        },
    )
    .expect("creates project");
    tasks::create(
        state,
        CreateTaskInput {
            project_id: project.id,
            title: "T".into(),
            description: None,
            priority: None,
            due_date: None,
            column_id: None,
        },
    )
    .expect("creates task")
}

fn add(state: &AppState, task: &Task, body: &str) -> String {
    comments::create(
        state,
        CreateCommentInput {
            task_id: task.id.clone(),
            body: body.into(),
        },
    )
    .expect("adds comment")
    .id
}

#[test]
fn comments_and_their_edits_survive_a_restart() {
    let directory = tempfile::tempdir().expect("temp dir");
    let first_run = initialize_state(directory.path()).expect("first start");
    let task = create_task(&first_run);
    let first = add(&first_run, &task, "first");
    let second = add(&first_run, &task, "second");
    comments::update(&first_run, &first, "first, edited").expect("edits");
    comments::delete(&first_run, &second).expect("deletes");
    drop(first_run);

    let second_run = initialize_state(directory.path()).expect("second start");
    let listed = comments::list(&second_run, &task.id).expect("lists");

    assert_eq!(listed.len(), 1);
    assert_eq!(listed[0].body, "first, edited");
    assert!(listed[0].updated_at >= listed[0].created_at);
}

#[test]
fn deleting_the_task_removes_its_comments_for_good() {
    let directory = tempfile::tempdir().expect("temp dir");
    let first_run = initialize_state(directory.path()).expect("first start");
    let task = create_task(&first_run);
    add(&first_run, &task, "note");
    tasks::delete(&first_run, &task.id).expect("deletes task");
    drop(first_run);

    let second_run = initialize_state(directory.path()).expect("second start");

    assert!(matches!(
        comments::list(&second_run, &task.id),
        Err(AppError::NotFound(_))
    ));
}
