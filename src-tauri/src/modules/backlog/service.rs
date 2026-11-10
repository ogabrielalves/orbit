use rusqlite::Connection;

use super::models::{BacklogGroup, BacklogItem, BacklogSort, ListBacklogInput};
use super::repository::{self, BacklogFilter};
use crate::error::{AppError, AppResult};
use crate::modules::tags::repository as tag_repository;
use crate::modules::tasks::models::Task;
use crate::modules::tasks::repository as task_repository;
use crate::shared::position::{self, Slot};
use crate::shared::text::{like_pattern, optional_text};
use crate::shared::time;
use crate::state::AppState;

pub fn list(state: &AppState, input: ListBacklogInput) -> AppResult<Vec<BacklogItem>> {
    let connection = state.database();
    load_items(&connection, input)
}

pub fn list_by_project(state: &AppState, input: ListBacklogInput) -> AppResult<Vec<BacklogGroup>> {
    let connection = state.database();
    let items = load_items(&connection, input)?;

    let mut groups: Vec<BacklogGroup> = Vec::new();
    for item in items {
        let existing = groups
            .iter_mut()
            .find(|group| group.project_id == item.task.project_id);
        match existing {
            Some(group) => group.items.push(item),
            None => groups.push(BacklogGroup {
                project_id: item.task.project_id.clone(),
                project_name: item.project_name.clone(),
                items: vec![item],
            }),
        }
    }
    groups.sort_by(|left, right| {
        let by_name = left
            .project_name
            .to_lowercase()
            .cmp(&right.project_name.to_lowercase());
        by_name.then_with(|| left.project_id.cmp(&right.project_id))
    });
    Ok(groups)
}

pub fn move_item(state: &AppState, id: &str, after_task_id: Option<String>) -> AppResult<Task> {
    let mut connection = state.database();
    let transaction = connection.transaction()?;
    let task = task_repository::find_by_id(&transaction, id)?
        .ok_or_else(|| AppError::NotFound("task".into()))?;

    let is_subtask = task.parent_task_id.is_some();
    if is_subtask {
        return Err(AppError::Validation(
            "subtasks cannot be placed on a board or in the backlog".into(),
        ));
    }
    let is_archived = task.archived_at.is_some();
    if is_archived {
        return Err(AppError::Conflict(
            "archived tasks cannot be moved; restore the task first".into(),
        ));
    }
    let is_on_a_board = task.board_id.is_some();
    if is_on_a_board {
        return Err(AppError::Validation("task is not in the backlog".into()));
    }

    let slots = task_repository::list_backlog_slots(&transaction, &task.project_id)?;
    let ordered = task_repository::to_slots(&slots);
    let is_already_there = position::previous_sibling_id(&ordered, id) == after_task_id.as_deref();
    if is_already_there {
        return Ok(task);
    }

    let siblings: Vec<Slot<'_>> = ordered
        .iter()
        .filter(|slot| slot.id != id)
        .copied()
        .collect();
    let new_position = position::place_after(&siblings, after_task_id.as_deref())?;
    task_repository::set_position(&transaction, id, &new_position, &time::now())?;
    let moved = task_repository::find_by_id(&transaction, id)?
        .ok_or_else(|| AppError::NotFound("task".into()))?;
    transaction.commit()?;
    Ok(moved)
}

fn load_items(connection: &Connection, input: ListBacklogInput) -> AppResult<Vec<BacklogItem>> {
    let search_pattern = optional_text(input.search).map(|term| like_pattern(&term));
    let priority = input.priority.map(|priority| priority.as_str());
    let filter = BacklogFilter {
        project_id: input.project_id.as_deref(),
        priority,
        tag_id: input.tag_id.as_deref(),
        search_pattern: search_pattern.as_deref(),
        sort: input.sort.unwrap_or(BacklogSort::Manual),
    };

    let rows = repository::list(connection, &filter)?;
    rows.into_iter()
        .map(|row| {
            let tags = tag_repository::list_by_task(connection, &row.task.id)?;
            Ok(BacklogItem {
                task: row.task,
                project_name: row.project_name,
                tags,
                subtask_count: row.subtask_count,
                subtasks_done: row.subtasks_done,
                checklist_count: row.checklist_count,
                checklist_done: row.checklist_done,
            })
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{connection::open_in_memory, migrations};
    use crate::modules::boards::models::{ColumnKind, CreateBoardInput, NewColumn};
    use crate::modules::boards::service as boards;
    use crate::modules::checklist::models::{CreateChecklistItemInput, UpdateChecklistItemInput};
    use crate::modules::checklist::service as checklist;
    use crate::modules::tags::models::CreateTagInput;
    use crate::modules::tags::service as tags;
    use crate::modules::tasks::models::{CreateSubtaskInput, CreateTaskInput, TaskPriority};
    use crate::modules::tasks::{placement_service, service as tasks, subtask_service as subtasks};
    use std::time::Duration;

    const NOW: &str = "2026-11-08T10:00:00.000Z";

    fn state() -> AppState {
        let mut connection = open_in_memory().expect("opens");
        migrations::run(&mut connection).expect("migrates");
        for (id, name) in [("p1", "Alpha"), ("p2", "beta"), ("p3", "Gamma")] {
            connection
                .execute(
                    "INSERT INTO projects (id, name, created_at, updated_at) VALUES (?1, ?2, ?3, ?3)",
                    (id, name, NOW),
                )
                .expect("project");
        }
        AppState::new(connection, None)
    }

    struct Seed<'a> {
        project: &'a str,
        title: &'a str,
        description: Option<&'a str>,
        priority: Option<TaskPriority>,
        due_date: Option<&'a str>,
    }

    fn seed<'a>(project: &'a str, title: &'a str) -> Seed<'a> {
        Seed {
            project,
            title,
            description: None,
            priority: None,
            due_date: None,
        }
    }

    fn add(state: &AppState, seed: Seed<'_>) -> Task {
        tasks::create(
            state,
            CreateTaskInput {
                project_id: seed.project.into(),
                title: seed.title.into(),
                description: seed.description.map(str::to_string),
                priority: seed.priority,
                due_date: seed.due_date.map(str::to_string),
                column_id: None,
            },
        )
        .expect("creates task")
    }

    fn titles(items: Vec<BacklogItem>) -> Vec<String> {
        items.into_iter().map(|item| item.task.title).collect()
    }

    fn sorted_by(state: &AppState, sort: BacklogSort) -> Vec<String> {
        titles(
            list(
                state,
                ListBacklogInput {
                    sort: Some(sort),
                    ..Default::default()
                },
            )
            .expect("lists"),
        )
    }

    fn filtered(state: &AppState, input: ListBacklogInput) -> Vec<String> {
        titles(list(state, input).expect("lists"))
    }

    #[test]
    fn an_empty_backlog_lists_nothing() {
        let state = state();

        assert!(
            list(&state, ListBacklogInput::default())
                .expect("lists")
                .is_empty()
        );
        assert!(
            list_by_project(&state, ListBacklogInput::default())
                .expect("lists")
                .is_empty()
        );
    }

    #[test]
    fn default_order_is_by_project_name_then_the_manual_order() {
        let state = state();
        add(&state, seed("p2", "beta-1"));
        add(&state, seed("p1", "alpha-1"));
        add(&state, seed("p2", "beta-2"));
        add(&state, seed("p1", "alpha-2"));

        let result = filtered(&state, ListBacklogInput::default());

        assert_eq!(result, ["alpha-1", "alpha-2", "beta-1", "beta-2"]);
    }

    #[test]
    fn tasks_on_boards_archived_subtasks_and_archived_projects_are_not_backlog() {
        let state = state();
        let board = boards::create(
            &state,
            CreateBoardInput {
                project_id: "p1".into(),
                name: "B".into(),
                columns: Some(vec![NewColumn::new("Todo", ColumnKind::Todo)]),
            },
        )
        .expect("creates board");
        let loose = add(&state, seed("p1", "loose"));
        let placed = add(&state, seed("p1", "placed"));
        placement_service::send_to_board(&state, &placed.id, &board.board.id, None).expect("sends");
        let archived = add(&state, seed("p1", "archived"));
        tasks::archive(&state, &archived.id).expect("archives");
        subtasks::create(
            &state,
            CreateSubtaskInput {
                parent_task_id: loose.id.clone(),
                title: "child".into(),
            },
        )
        .expect("subtask");
        add(&state, seed("p3", "dead project"));
        state
            .database()
            .execute(
                "UPDATE projects SET archived_at = ?1 WHERE id = 'p3'",
                [NOW],
            )
            .expect("archives project");

        let result = filtered(&state, ListBacklogInput::default());

        assert_eq!(result, ["loose"]);
    }

    #[test]
    fn sort_by_priority_puts_urgent_first_then_the_earliest_due_date() {
        let state = state();
        add(
            &state,
            Seed {
                priority: Some(TaskPriority::Low),
                ..seed("p1", "low")
            },
        );
        add(
            &state,
            Seed {
                priority: Some(TaskPriority::Urgent),
                due_date: Some("2026-12-31"),
                ..seed("p1", "urgent-late")
            },
        );
        add(
            &state,
            Seed {
                priority: Some(TaskPriority::Urgent),
                due_date: Some("2026-11-30"),
                ..seed("p2", "urgent-soon")
            },
        );
        add(
            &state,
            Seed {
                priority: Some(TaskPriority::Urgent),
                ..seed("p1", "urgent-undated")
            },
        );
        add(&state, seed("p1", "medium"));

        let result = sorted_by(&state, BacklogSort::Priority);

        assert_eq!(
            result,
            [
                "urgent-soon",
                "urgent-late",
                "urgent-undated",
                "medium",
                "low"
            ]
        );
    }

    #[test]
    fn sort_by_due_date_puts_undated_tasks_last() {
        let state = state();
        add(&state, seed("p1", "undated"));
        add(
            &state,
            Seed {
                due_date: Some("2026-12-01"),
                ..seed("p1", "later")
            },
        );
        add(
            &state,
            Seed {
                due_date: Some("2026-11-10"),
                priority: Some(TaskPriority::Low),
                ..seed("p1", "sooner")
            },
        );
        add(
            &state,
            Seed {
                due_date: Some("2026-11-10"),
                priority: Some(TaskPriority::High),
                ..seed("p1", "sooner-but-high")
            },
        );

        let result = sorted_by(&state, BacklogSort::DueDate);

        assert_eq!(result, ["sooner-but-high", "sooner", "later", "undated"]);
    }

    #[test]
    fn sort_by_created_is_newest_first_and_by_title_ignores_case() {
        let state = state();
        add(&state, seed("p1", "banana"));
        std::thread::sleep(Duration::from_millis(3));
        add(&state, seed("p1", "Apple"));
        std::thread::sleep(Duration::from_millis(3));
        add(&state, seed("p2", "cherry"));

        assert_eq!(
            sorted_by(&state, BacklogSort::Created),
            ["cherry", "Apple", "banana"]
        );
        assert_eq!(
            sorted_by(&state, BacklogSort::Title),
            ["Apple", "banana", "cherry"]
        );
    }

    #[test]
    fn filter_by_project_and_priority() {
        let state = state();
        add(
            &state,
            Seed {
                priority: Some(TaskPriority::High),
                ..seed("p1", "a-high")
            },
        );
        add(&state, seed("p1", "a-medium"));
        add(
            &state,
            Seed {
                priority: Some(TaskPriority::High),
                ..seed("p2", "b-high")
            },
        );

        let by_project = filtered(
            &state,
            ListBacklogInput {
                project_id: Some("p1".into()),
                ..Default::default()
            },
        );
        let by_priority = filtered(
            &state,
            ListBacklogInput {
                priority: Some(TaskPriority::High),
                ..Default::default()
            },
        );
        let both = filtered(
            &state,
            ListBacklogInput {
                project_id: Some("p2".into()),
                priority: Some(TaskPriority::High),
                ..Default::default()
            },
        );
        let unknown_project = filtered(
            &state,
            ListBacklogInput {
                project_id: Some("ghost".into()),
                ..Default::default()
            },
        );

        assert_eq!(by_project, ["a-high", "a-medium"]);
        assert_eq!(by_priority, ["a-high", "b-high"]);
        assert_eq!(both, ["b-high"]);
        assert!(unknown_project.is_empty());
    }

    #[test]
    fn filter_by_tag() {
        let state = state();
        let tagged = add(&state, seed("p1", "tagged"));
        add(&state, seed("p1", "plain"));
        let bug = tags::create(
            &state,
            CreateTagInput {
                name: "bug".into(),
                color: None,
            },
        )
        .expect("creates tag");
        tags::assign(&state, &tagged.id, &bug.id).expect("assigns");

        let result = filtered(
            &state,
            ListBacklogInput {
                tag_id: Some(bug.id),
                ..Default::default()
            },
        );

        assert_eq!(result, ["tagged"]);
    }

    #[test]
    fn search_matches_title_or_description_ignoring_case_and_treats_wildcards_literally() {
        let state = state();
        add(&state, seed("p1", "Fix LOGIN bug"));
        add(
            &state,
            Seed {
                description: Some("mentions the login page"),
                ..seed("p1", "Docs")
            },
        );
        add(&state, seed("p1", "100% done"));
        add(&state, seed("p1", "snake_case"));
        add(&state, seed("p1", "snakeXcase"));
        let search = |term: &str| {
            filtered(
                &state,
                ListBacklogInput {
                    search: Some(term.into()),
                    ..Default::default()
                },
            )
        };

        assert_eq!(search("  login "), ["Fix LOGIN bug", "Docs"]);
        assert_eq!(search("100%"), ["100% done"]);
        assert_eq!(search("snake_case"), ["snake_case"]);
        assert_eq!(search("   ").len(), 5);
        assert!(search("nothing like this").is_empty());
    }

    #[test]
    fn items_carry_project_name_tags_and_progress_counts() {
        let state = state();
        let task = add(&state, seed("p1", "T"));
        let ui = tags::create(
            &state,
            CreateTagInput {
                name: "ui".into(),
                color: Some("#123456".into()),
            },
        )
        .expect("creates tag");
        tags::assign(&state, &task.id, &ui.id).expect("assigns");
        let step = subtasks::create(
            &state,
            CreateSubtaskInput {
                parent_task_id: task.id.clone(),
                title: "Step".into(),
            },
        )
        .expect("subtask");
        subtasks::create(
            &state,
            CreateSubtaskInput {
                parent_task_id: task.id.clone(),
                title: "Step 2".into(),
            },
        )
        .expect("subtask");
        subtasks::set_done(&state, &step.id, true).expect("completes");
        let item = checklist::create(
            &state,
            CreateChecklistItemInput {
                task_id: task.id.clone(),
                text: "One".into(),
            },
        )
        .expect("item");
        checklist::create(
            &state,
            CreateChecklistItemInput {
                task_id: task.id.clone(),
                text: "Two".into(),
            },
        )
        .expect("item");
        checklist::update(
            &state,
            &item.id,
            UpdateChecklistItemInput {
                is_done: Some(true),
                ..Default::default()
            },
        )
        .expect("completes");

        let items = list(&state, ListBacklogInput::default()).expect("lists");

        assert_eq!(items.len(), 1);
        let first = &items[0];
        assert_eq!(first.project_name, "Alpha");
        assert_eq!(first.tags.len(), 1);
        assert_eq!(first.tags[0].name, "ui");
        assert_eq!(
            (
                first.subtask_count,
                first.subtasks_done,
                first.checklist_count,
                first.checklist_done
            ),
            (2, 1, 2, 1)
        );
    }

    #[test]
    fn grouping_orders_projects_by_name_and_keeps_the_sort_inside_each_group() {
        let state = state();
        add(&state, seed("p2", "b-one"));
        add(&state, seed("p1", "a-two"));
        add(
            &state,
            Seed {
                priority: Some(TaskPriority::Urgent),
                ..seed("p1", "a-urgent")
            },
        );
        add(&state, seed("p3", "g-one"));
        add(&state, seed("p2", "b-two"));

        let groups = list_by_project(
            &state,
            ListBacklogInput {
                sort: Some(BacklogSort::Priority),
                ..Default::default()
            },
        )
        .expect("groups");

        let summary: Vec<(String, Vec<String>)> = groups
            .into_iter()
            .map(|group| {
                (
                    group.project_name,
                    group
                        .items
                        .into_iter()
                        .map(|item| item.task.title)
                        .collect(),
                )
            })
            .collect();
        assert_eq!(
            summary,
            [
                (
                    "Alpha".to_string(),
                    vec!["a-urgent".to_string(), "a-two".to_string()]
                ),
                (
                    "beta".to_string(),
                    vec!["b-one".to_string(), "b-two".to_string()]
                ),
                ("Gamma".to_string(), vec!["g-one".to_string()]),
            ]
        );
    }

    #[test]
    fn grouping_respects_the_filters_and_skips_empty_projects() {
        let state = state();
        add(&state, seed("p1", "keep me"));
        add(&state, seed("p2", "drop me"));

        let groups = list_by_project(
            &state,
            ListBacklogInput {
                search: Some("keep".into()),
                ..Default::default()
            },
        )
        .expect("groups");

        assert_eq!(groups.len(), 1);
        assert_eq!(groups[0].project_id, "p1");
    }

    #[test]
    fn reordering_moves_a_task_to_the_first_middle_and_last_places_of_its_project() {
        let state = state();
        let a = add(&state, seed("p1", "A"));
        let b = add(&state, seed("p1", "B"));
        let c = add(&state, seed("p1", "C"));
        add(&state, seed("p2", "other"));
        let project_one = || {
            filtered(
                &state,
                ListBacklogInput {
                    project_id: Some("p1".into()),
                    ..Default::default()
                },
            )
        };

        move_item(&state, &c.id, None).expect("C first");
        assert_eq!(project_one(), ["C", "A", "B"]);
        move_item(&state, &c.id, Some(a.id.clone())).expect("C after A");
        assert_eq!(project_one(), ["A", "C", "B"]);
        move_item(&state, &a.id, Some(b.id.clone())).expect("A last");
        assert_eq!(project_one(), ["C", "B", "A"]);
    }

    #[test]
    fn reordering_to_the_current_place_changes_nothing() {
        let state = state();
        let a = add(&state, seed("p1", "A"));
        let b = add(&state, seed("p1", "B"));

        let first = move_item(&state, &a.id, None).expect("no-op");
        let second = move_item(&state, &b.id, Some(a.id.clone())).expect("no-op");

        assert_eq!((first, second), (a, b));
    }

    #[test]
    fn reordering_rejects_foreign_anchors_and_tasks_that_are_not_loose_backlog_tasks() {
        let state = state();
        let mine = add(&state, seed("p1", "mine"));
        let theirs = add(&state, seed("p2", "theirs"));
        let child = subtasks::create(
            &state,
            CreateSubtaskInput {
                parent_task_id: mine.id.clone(),
                title: "child".into(),
            },
        )
        .expect("subtask");
        let archived = add(&state, seed("p1", "old"));
        tasks::archive(&state, &archived.id).expect("archives");
        let board = boards::create(
            &state,
            CreateBoardInput {
                project_id: "p1".into(),
                name: "B".into(),
                columns: Some(vec![NewColumn::new("Todo", ColumnKind::Todo)]),
            },
        )
        .expect("creates board");
        let placed = add(&state, seed("p1", "placed"));
        placement_service::send_to_board(&state, &placed.id, &board.board.id, None).expect("sends");

        assert!(matches!(
            move_item(&state, &mine.id, Some(theirs.id)),
            Err(AppError::InvalidMove)
        ));
        assert!(matches!(
            move_item(&state, &mine.id, Some(mine.id.clone())),
            Err(AppError::InvalidMove)
        ));
        assert!(matches!(
            move_item(&state, &child.id, None),
            Err(AppError::Validation(_))
        ));
        assert!(matches!(
            move_item(&state, &archived.id, None),
            Err(AppError::Conflict(_))
        ));
        assert!(matches!(
            move_item(&state, &placed.id, None),
            Err(AppError::Validation(_))
        ));
        assert!(matches!(
            move_item(&state, "ghost", None),
            Err(AppError::NotFound(_))
        ));
    }

    #[test]
    fn reordering_does_not_touch_the_activity_log() {
        let state = state();
        let a = add(&state, seed("p1", "A"));
        let b = add(&state, seed("p1", "B"));
        let before = crate::modules::activity::service::recent(&state, Some(100))
            .expect("reads")
            .len();

        move_item(&state, &b.id, None).expect("moves");
        move_item(&state, &a.id, None).expect("moves");

        let after = crate::modules::activity::service::recent(&state, Some(100))
            .expect("reads")
            .len();
        assert_eq!(before, after);
    }
}
