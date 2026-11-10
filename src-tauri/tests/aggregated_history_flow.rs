#![allow(clippy::expect_used)]

use orbit_lib::bootstrap::initialize_state;
use orbit_lib::modules::activity::models::{ActivityAction, ActivityEntry, EntityType};
use orbit_lib::modules::activity::service as activity;
use orbit_lib::modules::checklist::models::{CreateChecklistItemInput, UpdateChecklistItemInput};
use orbit_lib::modules::checklist::service as checklist;
use orbit_lib::modules::comments::models::CreateCommentInput;
use orbit_lib::modules::comments::service as comments;
use orbit_lib::modules::projects::models::CreateProjectInput;
use orbit_lib::modules::projects::service as projects;
use orbit_lib::modules::tags::models::CreateTagInput;
use orbit_lib::modules::tags::service as tags;
use orbit_lib::modules::tasks::models::{
    CreateSubtaskInput, CreateTaskInput, Task, UpdateTaskInput,
};
use orbit_lib::modules::tasks::{service as tasks, subtask_service as subtasks};
use orbit_lib::state::AppState;

fn create_task(state: &AppState, project_id: &str, title: &str) -> Task {
    tasks::create(
        state,
        CreateTaskInput {
            project_id: project_id.into(),
            title: title.into(),
            description: None,
            priority: None,
            due_date: None,
            column_id: None,
        },
    )
    .expect("creates task")
}

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

fn shape(entries: &[ActivityEntry]) -> Vec<(EntityType, ActivityAction)> {
    entries
        .iter()
        .map(|entry| (entry.entity_type, entry.action))
        .collect()
}

#[test]
fn the_task_history_gathers_checklist_comment_subtask_and_tag_events_newest_first() {
    let directory = tempfile::tempdir().expect("temp dir");
    let first_run = initialize_state(directory.path()).expect("first start");
    let project = create_project(&first_run);
    let task = create_task(&first_run, &project, "Parent");
    let other = create_task(&first_run, &project, "Unrelated");
    let step = subtasks::create(
        &first_run,
        CreateSubtaskInput {
            parent_task_id: task.id.clone(),
            title: "Step".into(),
        },
    )
    .expect("creates subtask");
    subtasks::set_done(&first_run, &step.id, true).expect("completes");
    tasks::update(
        &first_run,
        &step.id,
        UpdateTaskInput {
            title: Some("Step renamed".into()),
            ..Default::default()
        },
    )
    .expect("renames subtask");
    let item = checklist::create(
        &first_run,
        CreateChecklistItemInput {
            task_id: task.id.clone(),
            text: "Item".into(),
        },
    )
    .expect("adds item");
    checklist::update(
        &first_run,
        &item.id,
        UpdateChecklistItemInput {
            is_done: Some(true),
            ..Default::default()
        },
    )
    .expect("completes item");
    let sub_item = checklist::create(
        &first_run,
        CreateChecklistItemInput {
            task_id: step.id.clone(),
            text: "Detail".into(),
        },
    )
    .expect("adds subtask item");
    let note = comments::create(
        &first_run,
        CreateCommentInput {
            task_id: task.id.clone(),
            body: "Note".into(),
        },
    )
    .expect("comments");
    comments::update(&first_run, &note.id, "Note, edited").expect("edits");
    comments::delete(&first_run, &note.id).expect("deletes comment");
    checklist::delete(&first_run, &sub_item.id).expect("deletes subtask item");
    let tag = tags::create(
        &first_run,
        CreateTagInput {
            name: "bug".into(),
            color: None,
        },
    )
    .expect("creates tag");
    tags::assign(&first_run, &task.id, &tag.id).expect("assigns");
    comments::create(
        &first_run,
        CreateCommentInput {
            task_id: other.id.clone(),
            body: "Elsewhere".into(),
        },
    )
    .expect("comments elsewhere");
    drop(first_run);

    let second_run = initialize_state(directory.path()).expect("second start");
    let history = activity::task_history(&second_run, &task.id, None).expect("reads");

    use ActivityAction::{Completed, Created, Deleted, Updated};
    use EntityType::{ChecklistItem, Comment, Task as TaskEntity};
    assert_eq!(
        shape(&history),
        [
            (TaskEntity, Updated),
            (ChecklistItem, Deleted),
            (Comment, Deleted),
            (Comment, Updated),
            (Comment, Created),
            (ChecklistItem, Created),
            (ChecklistItem, Completed),
            (ChecklistItem, Created),
            (TaskEntity, Updated),
            (TaskEntity, Completed),
            (TaskEntity, Created),
            (TaskEntity, Created),
        ]
    );
    let unrelated = activity::task_history(&second_run, &other.id, None).expect("reads");
    assert_eq!(
        shape(&unrelated),
        [(Comment, Created), (TaskEntity, Created)]
    );
}

#[test]
fn asking_for_a_subtask_returns_only_its_own_entries() {
    let directory = tempfile::tempdir().expect("temp dir");
    let state = initialize_state(directory.path()).expect("starts");
    let project = create_project(&state);
    let task = create_task(&state, &project, "Parent");
    let step = subtasks::create(
        &state,
        CreateSubtaskInput {
            parent_task_id: task.id.clone(),
            title: "Step".into(),
        },
    )
    .expect("creates subtask");
    subtasks::set_done(&state, &step.id, true).expect("completes");

    let history = activity::task_history(&state, &step.id, None).expect("reads");

    use ActivityAction::{Completed, Created};
    assert_eq!(
        shape(&history),
        [(EntityType::Task, Completed), (EntityType::Task, Created)]
    );
    assert!(history.iter().all(|entry| entry.entity_id == step.id));
}

#[test]
fn deleting_the_task_keeps_its_history_readable_with_the_deletion_on_top() {
    let directory = tempfile::tempdir().expect("temp dir");
    let state = initialize_state(directory.path()).expect("starts");
    let project = create_project(&state);
    let task = create_task(&state, &project, "Doomed");
    comments::create(
        &state,
        CreateCommentInput {
            task_id: task.id.clone(),
            body: "Last words".into(),
        },
    )
    .expect("comments");

    tasks::delete(&state, &task.id).expect("deletes");
    let history = activity::task_history(&state, &task.id, None).expect("reads");

    use ActivityAction::{Created, Deleted};
    assert_eq!(
        shape(&history),
        [
            (EntityType::Task, Deleted),
            (EntityType::Comment, Created),
            (EntityType::Task, Created)
        ]
    );
}

#[test]
fn a_deleted_subtask_still_shows_up_in_the_parent_history() {
    let directory = tempfile::tempdir().expect("temp dir");
    let state = initialize_state(directory.path()).expect("starts");
    let project = create_project(&state);
    let task = create_task(&state, &project, "Parent");
    let step = subtasks::create(
        &state,
        CreateSubtaskInput {
            parent_task_id: task.id.clone(),
            title: "Step".into(),
        },
    )
    .expect("creates subtask");

    tasks::delete(&state, &step.id).expect("deletes subtask");
    let history = activity::task_history(&state, &task.id, None).expect("reads");

    use ActivityAction::{Created, Deleted};
    assert_eq!(
        shape(&history),
        [
            (EntityType::Task, Deleted),
            (EntityType::Task, Created),
            (EntityType::Task, Created)
        ]
    );
}

#[test]
fn the_limit_applies_to_the_aggregated_history() {
    let directory = tempfile::tempdir().expect("temp dir");
    let state = initialize_state(directory.path()).expect("starts");
    let project = create_project(&state);
    let task = create_task(&state, &project, "Parent");
    for index in 0..5 {
        comments::create(
            &state,
            CreateCommentInput {
                task_id: task.id.clone(),
                body: format!("note {index}"),
            },
        )
        .expect("comments");
    }

    let limited = activity::task_history(&state, &task.id, Some(3)).expect("reads");

    assert_eq!(limited.len(), 3);
    assert!(
        limited
            .iter()
            .all(|entry| entry.entity_type == EntityType::Comment)
    );
}
