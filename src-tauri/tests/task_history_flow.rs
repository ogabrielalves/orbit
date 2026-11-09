#![allow(clippy::expect_used)]

use orbit_lib::bootstrap::initialize_state;
use orbit_lib::modules::activity::models::{ActivityAction, EntityType};
use orbit_lib::modules::activity::service as activity;
use orbit_lib::modules::boards::models::{ColumnKind, CreateBoardInput, NewColumn};
use orbit_lib::modules::boards::service as boards;
use orbit_lib::modules::projects::models::CreateProjectInput;
use orbit_lib::modules::projects::service as projects;
use orbit_lib::modules::tags::models::CreateTagInput;
use orbit_lib::modules::tags::service as tags;
use orbit_lib::modules::tasks::models::{
    CreateSubtaskInput, CreateTaskInput, TaskPriority, UpdateTaskInput,
};
use orbit_lib::modules::tasks::{
    duplicate_service as duplicates, placement_service, service as tasks,
    subtask_service as subtasks,
};

#[test]
fn a_tasks_whole_life_is_readable_newest_first_after_a_restart_and_after_deletion() {
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
    let board = boards::create(
        &first_run,
        CreateBoardInput {
            project_id: project.id.clone(),
            name: "B".into(),
            columns: Some(vec![
                NewColumn::new("Todo", ColumnKind::Todo),
                NewColumn::new("Done", ColumnKind::Done),
            ]),
        },
    )
    .expect("creates board");
    let task = tasks::create(
        &first_run,
        CreateTaskInput {
            project_id: project.id,
            title: "Ship".into(),
            description: None,
            priority: None,
            due_date: None,
            column_id: Some(board.columns[0].id.clone()),
        },
    )
    .expect("creates task");
    tasks::update(
        &first_run,
        &task.id,
        UpdateTaskInput {
            priority: Some(TaskPriority::Urgent),
            ..Default::default()
        },
    )
    .expect("updates");
    let tag = tags::create(
        &first_run,
        CreateTagInput {
            name: "release".into(),
            color: None,
        },
    )
    .expect("creates tag");
    tags::assign(&first_run, &task.id, &tag.id).expect("assigns");
    placement_service::move_task(&first_run, &task.id, &board.columns[1].id, None)
        .expect("moves to done");
    tasks::archive(&first_run, &task.id).expect("archives");
    tasks::restore(&first_run, &task.id).expect("restores");
    drop(first_run);

    let second_run = initialize_state(directory.path()).expect("second start");
    let history = activity::history(&second_run, EntityType::Task, &task.id, None).expect("reads");

    let actions: Vec<ActivityAction> = history.iter().map(|entry| entry.action).collect();
    assert_eq!(
        actions,
        [
            ActivityAction::Restored,
            ActivityAction::Archived,
            ActivityAction::Moved,
            ActivityAction::Updated,
            ActivityAction::Updated,
            ActivityAction::Created,
        ]
    );
    let priority = history[4].changes.as_ref().expect("has changes");
    assert_eq!(priority["priority"].from.as_deref(), Some("medium"));
    assert_eq!(priority["priority"].to.as_deref(), Some("urgent"));
    let tagged = history[3].changes.as_ref().expect("has changes");
    assert_eq!(tagged["tag"].to.as_deref(), Some("release"));

    tasks::delete(&second_run, &task.id).expect("deletes");
    let after_delete =
        activity::history(&second_run, EntityType::Task, &task.id, None).expect("reads");
    assert_eq!(after_delete.len(), history.len() + 1);
    assert_eq!(after_delete[0].action, ActivityAction::Deleted);
}

#[test]
fn subtasks_and_duplicates_keep_separate_histories() {
    let directory = tempfile::tempdir().expect("temp dir");
    let state = initialize_state(directory.path()).expect("starts");
    let project = projects::create(
        &state,
        CreateProjectInput {
            name: "P".into(),
            description: None,
            icon: None,
            color: None,
        },
    )
    .expect("creates project");
    let parent = tasks::create(
        &state,
        CreateTaskInput {
            project_id: project.id,
            title: "Parent".into(),
            description: None,
            priority: None,
            due_date: None,
            column_id: None,
        },
    )
    .expect("creates task");
    let step = subtasks::create(
        &state,
        CreateSubtaskInput {
            parent_task_id: parent.id.clone(),
            title: "Step".into(),
        },
    )
    .expect("creates subtask");
    subtasks::set_done(&state, &step.id, true).expect("completes");
    let copy = duplicates::duplicate(&state, &parent.id, None).expect("duplicates");

    let parent_history =
        activity::history(&state, EntityType::Task, &parent.id, None).expect("reads");
    let step_history = activity::history(&state, EntityType::Task, &step.id, None).expect("reads");
    let copy_history = activity::history(&state, EntityType::Task, &copy.id, None).expect("reads");

    assert_eq!(parent_history.len(), 1);
    let step_actions: Vec<ActivityAction> = step_history.iter().map(|entry| entry.action).collect();
    assert_eq!(
        step_actions,
        [ActivityAction::Completed, ActivityAction::Created]
    );
    assert_eq!(copy_history.len(), 1);
    assert_eq!(copy_history[0].action, ActivityAction::Duplicated);
}
