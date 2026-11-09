#![allow(clippy::expect_used)]

use orbit_lib::bootstrap::initialize_state;
use orbit_lib::error::AppError;
use orbit_lib::modules::dashboard::models::DashboardSummaryInput;
use orbit_lib::modules::dashboard::service as dashboard;
use orbit_lib::modules::projects::models::CreateProjectInput;
use orbit_lib::modules::projects::service as projects;
use orbit_lib::modules::tasks::models::{CreateSubtaskInput, CreateTaskInput, Task};
use orbit_lib::modules::tasks::{service as tasks, subtask_service as subtasks};
use orbit_lib::state::AppState;

fn create_parent(state: &AppState) -> Task {
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
            title: "Parent".into(),
            description: None,
            priority: None,
            due_date: None,
            column_id: None,
        },
    )
    .expect("creates parent")
}

fn add(state: &AppState, parent: &Task, title: &str) -> Task {
    subtasks::create(
        state,
        CreateSubtaskInput {
            parent_task_id: parent.id.clone(),
            title: title.into(),
        },
    )
    .expect("creates subtask")
}

fn titles(state: &AppState, parent: &Task) -> Vec<String> {
    subtasks::list(state, &parent.id)
        .expect("lists")
        .into_iter()
        .map(|task| task.title)
        .collect()
}

#[test]
fn subtask_order_and_completion_survive_a_restart() {
    let directory = tempfile::tempdir().expect("temp dir");
    let first_run = initialize_state(directory.path()).expect("first start");
    let parent = create_parent(&first_run);
    let a = add(&first_run, &parent, "A");
    let b = add(&first_run, &parent, "B");
    let c = add(&first_run, &parent, "C");
    subtasks::move_subtask(&first_run, &c.id, None).expect("C first");
    subtasks::set_done(&first_run, &b.id, true).expect("B done");
    drop(first_run);

    let second_run = initialize_state(directory.path()).expect("second start");

    assert_eq!(titles(&second_run, &parent), ["C", "A", "B"]);
    let listed = subtasks::list(&second_run, &parent.id).expect("lists");
    let completion: Vec<bool> = listed
        .iter()
        .map(|task| task.completed_at.is_some())
        .collect();
    assert_eq!(completion, [false, false, true]);
    assert_eq!(listed[1].id, a.id);
}

#[test]
fn the_dashboard_counts_the_parent_and_ignores_its_subtasks() {
    let directory = tempfile::tempdir().expect("temp dir");
    let state = initialize_state(directory.path()).expect("starts");
    let parent = create_parent(&state);
    add(&state, &parent, "A");
    add(&state, &parent, "B");

    let summary = dashboard::summary(
        &state,
        DashboardSummaryInput {
            today: Some("2026-11-08".into()),
            ..Default::default()
        },
    )
    .expect("summarizes");

    assert_eq!(summary.tasks.total, 1);
    assert_eq!(summary.tasks.backlog, 1);
}

#[test]
fn deleting_the_parent_removes_the_subtasks_for_good() {
    let directory = tempfile::tempdir().expect("temp dir");
    let first_run = initialize_state(directory.path()).expect("first start");
    let parent = create_parent(&first_run);
    let step = add(&first_run, &parent, "Step");
    tasks::delete(&first_run, &parent.id).expect("deletes parent");
    drop(first_run);

    let second_run = initialize_state(directory.path()).expect("second start");

    assert!(matches!(
        tasks::get(&second_run, &step.id),
        Err(AppError::NotFound(_))
    ));
}
