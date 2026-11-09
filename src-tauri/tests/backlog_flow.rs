#![allow(clippy::expect_used)]

use orbit_lib::bootstrap::initialize_state;
use orbit_lib::modules::backlog::models::{BacklogSort, ListBacklogInput};
use orbit_lib::modules::backlog::service as backlog;
use orbit_lib::modules::boards::models::{ColumnKind, CreateBoardInput, NewColumn};
use orbit_lib::modules::boards::service as boards;
use orbit_lib::modules::checklist::models::CreateChecklistItemInput;
use orbit_lib::modules::checklist::service as checklist;
use orbit_lib::modules::projects::models::CreateProjectInput;
use orbit_lib::modules::projects::service as projects;
use orbit_lib::modules::tags::models::CreateTagInput;
use orbit_lib::modules::tags::service as tags;
use orbit_lib::modules::tasks::models::{CreateSubtaskInput, CreateTaskInput, Task};
use orbit_lib::modules::tasks::{placement_service, service as tasks, subtask_service as subtasks};
use orbit_lib::state::AppState;

fn create_project(state: &AppState, name: &str) -> String {
    projects::create(
        state,
        CreateProjectInput {
            name: name.into(),
            description: None,
            icon: None,
            color: None,
        },
    )
    .expect("creates project")
    .id
}

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

fn titles(state: &AppState, project_id: &str) -> Vec<String> {
    backlog::list(
        state,
        ListBacklogInput {
            project_id: Some(project_id.into()),
            sort: Some(BacklogSort::Manual),
            ..Default::default()
        },
    )
    .expect("lists")
    .into_iter()
    .map(|item| item.task.title)
    .collect()
}

#[test]
fn the_backlog_order_survives_a_restart() {
    let directory = tempfile::tempdir().expect("temp dir");
    let first_run = initialize_state(directory.path()).expect("first start");
    let project = create_project(&first_run, "P");
    let a = create_task(&first_run, &project, "A");
    create_task(&first_run, &project, "B");
    let c = create_task(&first_run, &project, "C");
    backlog::move_item(&first_run, &c.id, None).expect("C first");
    backlog::move_item(&first_run, &a.id, Some(c.id.clone())).expect("A after C");
    drop(first_run);

    let second_run = initialize_state(directory.path()).expect("second start");

    assert_eq!(titles(&second_run, &project), ["C", "A", "B"]);
}

#[test]
fn sending_a_backlog_item_to_a_board_keeps_all_its_data_and_removes_it_from_the_backlog() {
    let directory = tempfile::tempdir().expect("temp dir");
    let state = initialize_state(directory.path()).expect("starts");
    let project = create_project(&state, "P");
    let idea = create_task(&state, &project, "Idea");
    checklist::create(
        &state,
        CreateChecklistItemInput {
            task_id: idea.id.clone(),
            text: "Item".into(),
        },
    )
    .expect("adds item");
    subtasks::create(
        &state,
        CreateSubtaskInput {
            parent_task_id: idea.id.clone(),
            title: "Step".into(),
        },
    )
    .expect("adds subtask");
    let tag = tags::create(
        &state,
        CreateTagInput {
            name: "bug".into(),
            color: None,
        },
    )
    .expect("creates tag");
    tags::assign(&state, &idea.id, &tag.id).expect("assigns");
    let board = boards::create(
        &state,
        CreateBoardInput {
            project_id: project.clone(),
            name: "Sprint".into(),
            columns: Some(vec![NewColumn::new("Todo", ColumnKind::Todo)]),
        },
    )
    .expect("creates board");

    placement_service::send_to_board(&state, &idea.id, &board.board.id, None).expect("sends");

    assert!(titles(&state, &project).is_empty());
    assert_eq!(checklist::list(&state, &idea.id).expect("lists").len(), 1);
    assert_eq!(subtasks::list(&state, &idea.id).expect("lists").len(), 1);
    assert_eq!(
        tags::list_for_task(&state, &idea.id).expect("lists").len(),
        1
    );

    placement_service::send_to_backlog(&state, &idea.id).expect("returns");
    let back = backlog::list(&state, ListBacklogInput::default()).expect("lists");
    assert_eq!(back.len(), 1);
    assert_eq!(back[0].checklist_count, 1);
    assert_eq!(back[0].subtask_count, 1);
    assert_eq!(back[0].tags.len(), 1);
}

#[test]
fn grouping_follows_the_projects_across_a_restart() {
    let directory = tempfile::tempdir().expect("temp dir");
    let first_run = initialize_state(directory.path()).expect("first start");
    let zebra = create_project(&first_run, "Zebra");
    let apple = create_project(&first_run, "apple");
    create_task(&first_run, &zebra, "z1");
    create_task(&first_run, &apple, "a1");
    create_task(&first_run, &apple, "a2");
    drop(first_run);

    let second_run = initialize_state(directory.path()).expect("second start");
    let groups =
        backlog::list_by_project(&second_run, ListBacklogInput::default()).expect("groups");

    let summary: Vec<(&str, usize)> = groups
        .iter()
        .map(|group| (group.project_name.as_str(), group.items.len()))
        .collect();
    assert_eq!(summary, [("apple", 2), ("Zebra", 1)]);
}
