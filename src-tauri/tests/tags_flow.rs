#![allow(clippy::expect_used)]

use orbit_lib::bootstrap::initialize_state;
use orbit_lib::error::AppError;
use orbit_lib::modules::projects::models::CreateProjectInput;
use orbit_lib::modules::projects::service as projects;
use orbit_lib::modules::tags::models::{CreateTagInput, UpdateTagInput};
use orbit_lib::modules::tags::service as tags;
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

fn new_tag(state: &AppState, name: &str) -> String {
    tags::create(
        state,
        CreateTagInput {
            name: name.into(),
            color: None,
        },
    )
    .expect("creates tag")
    .id
}

#[test]
fn tags_and_assignments_survive_a_restart() {
    let directory = tempfile::tempdir().expect("temp dir");
    let first_run = initialize_state(directory.path()).expect("first start");
    let task = create_task(&first_run);
    let bug = new_tag(&first_run, "bug");
    let ui = new_tag(&first_run, "ui");
    tags::assign(&first_run, &task.id, &bug).expect("assigns bug");
    tags::assign(&first_run, &task.id, &ui).expect("assigns ui");
    tags::update(
        &first_run,
        &ui,
        UpdateTagInput {
            name: Some("design".into()),
            color: Some(Some("#00ff00".into())),
        },
    )
    .expect("renames");
    tags::unassign(&first_run, &task.id, &bug).expect("unassigns");
    drop(first_run);

    let second_run = initialize_state(directory.path()).expect("second start");
    let assigned = tags::list_for_task(&second_run, &task.id).expect("lists");
    let all = tags::list(&second_run).expect("lists");

    assert_eq!(assigned.len(), 1);
    assert_eq!(assigned[0].name, "design");
    assert_eq!(assigned[0].color.as_deref(), Some("#00ff00"));
    let counts: Vec<(&str, u32)> = all
        .iter()
        .map(|tag| (tag.name.as_str(), tag.task_count))
        .collect();
    assert_eq!(counts, [("bug", 0), ("design", 1)]);
}

#[test]
fn the_unique_name_rule_holds_across_restarts() {
    let directory = tempfile::tempdir().expect("temp dir");
    let first_run = initialize_state(directory.path()).expect("first start");
    new_tag(&first_run, "Bug");
    drop(first_run);

    let second_run = initialize_state(directory.path()).expect("second start");
    let duplicate = tags::create(
        &second_run,
        CreateTagInput {
            name: "bug".into(),
            color: None,
        },
    );

    assert!(matches!(duplicate, Err(AppError::Conflict(_))));
}
