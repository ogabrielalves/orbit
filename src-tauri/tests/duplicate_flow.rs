#![allow(clippy::expect_used)]

use orbit_lib::bootstrap::initialize_state;
use orbit_lib::modules::checklist::models::CreateChecklistItemInput;
use orbit_lib::modules::checklist::service as checklist;
use orbit_lib::modules::projects::models::CreateProjectInput;
use orbit_lib::modules::projects::service as projects;
use orbit_lib::modules::tags::models::CreateTagInput;
use orbit_lib::modules::tags::service as tags;
use orbit_lib::modules::tasks::models::{CreateSubtaskInput, CreateTaskInput};
use orbit_lib::modules::tasks::{
    duplicate_service as duplicates, service as tasks, subtask_service as subtasks,
};

#[test]
fn a_duplicated_task_and_everything_copied_with_it_survive_a_restart() {
    let directory = tempfile::tempdir().expect("temp dir");
    let first_run = initialize_state(directory.path()).expect("first start");
    let project = projects::create(
        &first_run,
        CreateProjectInput {
            name: "P".into(),
            description: None,
            icon: None,
            color: None,
        },
    )
    .expect("creates project");
    let source = tasks::create(
        &first_run,
        CreateTaskInput {
            project_id: project.id,
            title: "Plan".into(),
            description: None,
            priority: None,
            due_date: None,
            column_id: None,
        },
    )
    .expect("creates task");
    checklist::create(
        &first_run,
        CreateChecklistItemInput {
            task_id: source.id.clone(),
            text: "Item".into(),
        },
    )
    .expect("adds item");
    subtasks::create(
        &first_run,
        CreateSubtaskInput {
            parent_task_id: source.id.clone(),
            title: "Step".into(),
        },
    )
    .expect("adds subtask");
    let bug = tags::create(
        &first_run,
        CreateTagInput {
            name: "bug".into(),
            color: None,
        },
    )
    .expect("creates tag");
    tags::assign(&first_run, &source.id, &bug.id).expect("assigns");
    let copy = duplicates::duplicate(&first_run, &source.id, None).expect("duplicates");
    drop(first_run);

    let second_run = initialize_state(directory.path()).expect("second start");

    let reloaded = tasks::get(&second_run, &copy.id).expect("copy survives");
    assert_eq!(reloaded.title, "Plan (copy)");
    assert_eq!(
        checklist::list(&second_run, &copy.id).expect("lists").len(),
        1
    );
    assert_eq!(
        subtasks::list(&second_run, &copy.id).expect("lists").len(),
        1
    );
    assert_eq!(
        tags::list_for_task(&second_run, &copy.id)
            .expect("lists")
            .len(),
        1
    );
    let all_tags = tags::list(&second_run).expect("lists");
    assert_eq!(all_tags[0].task_count, 2);
}
