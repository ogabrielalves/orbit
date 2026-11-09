#![allow(clippy::expect_used)]

use orbit_lib::bootstrap::initialize_state;
use orbit_lib::error::AppError;
use orbit_lib::modules::checklist::models::{
    ChecklistItem, CreateChecklistItemInput, UpdateChecklistItemInput,
};
use orbit_lib::modules::checklist::service as checklist;
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

fn add(state: &AppState, task: &Task, text: &str) -> ChecklistItem {
    checklist::create(
        state,
        CreateChecklistItemInput {
            task_id: task.id.clone(),
            text: text.into(),
        },
    )
    .expect("adds item")
}

fn summary(state: &AppState, task: &Task) -> Vec<(String, bool)> {
    checklist::list(state, &task.id)
        .expect("lists")
        .into_iter()
        .map(|item| (item.text, item.is_done))
        .collect()
}

#[test]
fn order_text_and_done_state_survive_a_restart() {
    let directory = tempfile::tempdir().expect("temp dir");
    let first_run = initialize_state(directory.path()).expect("first start");
    let task = create_task(&first_run);
    let a = add(&first_run, &task, "A");
    let b = add(&first_run, &task, "B");
    let c = add(&first_run, &task, "C");
    checklist::move_item(&first_run, &c.id, None).expect("C first");
    checklist::update(
        &first_run,
        &b.id,
        UpdateChecklistItemInput {
            text: Some("B2".into()),
            is_done: Some(true),
        },
    )
    .expect("updates B");
    checklist::delete(&first_run, &a.id).expect("deletes A");
    drop(first_run);

    let second_run = initialize_state(directory.path()).expect("second start");

    assert_eq!(
        summary(&second_run, &task),
        [("C".to_string(), false), ("B2".to_string(), true)]
    );
}

#[test]
fn deleting_the_task_removes_its_checklist_for_good() {
    let directory = tempfile::tempdir().expect("temp dir");
    let first_run = initialize_state(directory.path()).expect("first start");
    let task = create_task(&first_run);
    add(&first_run, &task, "A");
    tasks::delete(&first_run, &task.id).expect("deletes task");
    drop(first_run);

    let second_run = initialize_state(directory.path()).expect("second start");

    assert!(matches!(
        checklist::list(&second_run, &task.id),
        Err(AppError::NotFound(_))
    ));
}
