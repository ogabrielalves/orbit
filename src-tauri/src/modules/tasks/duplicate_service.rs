use rusqlite::Connection;

use super::models::Task;
use super::repository;
use super::service::{TITLE_MAX_LENGTH, find_existing, record, visible_siblings};
use super::subtask_service::to_slots;
use crate::error::{AppError, AppResult};
use crate::modules::activity::models::{ActivityAction, ChangeSet};
use crate::modules::checklist::models::ChecklistItem;
use crate::modules::checklist::repository as checklist_repository;
use crate::modules::tags::repository as tag_repository;
use crate::shared::position;
use crate::shared::text::require_text;
use crate::shared::{id, time};
use crate::state::AppState;

const COPY_SUFFIX: &str = " (copy)";

/// Duplicates a top-level task right after the original, with its checklist, tags and
/// subtasks (each subtask with its own checklist and tags). Progress starts over: checklist
/// items and subtasks are copied as open. Comments and attachments are not copied.
pub fn duplicate(state: &AppState, id: &str, title: Option<String>) -> AppResult<Task> {
    let mut connection = state.database();
    let transaction = connection.transaction()?;
    let source = find_existing(&transaction, id)?;

    let is_subtask = source.parent_task_id.is_some();
    if is_subtask {
        return Err(AppError::Validation(
            "subtasks cannot be duplicated on their own; duplicate the parent task".into(),
        ));
    }
    let is_archived = source.archived_at.is_some();
    if is_archived {
        return Err(AppError::Conflict(
            "archived tasks cannot be duplicated; restore the task first".into(),
        ));
    }

    let new_title = match title {
        Some(requested) => require_text("task title", &requested, TITLE_MAX_LENGTH)?,
        None => copy_title(&source.title),
    };
    let siblings = visible_siblings(&transaction, &source)?;
    let ordered = to_slots(&siblings);
    let new_position = position::place_after(&ordered, Some(source.id.as_str()))?;

    let now = time::now();
    let copy = Task {
        id: id::new_id(),
        title: new_title,
        position: new_position,
        created_at: now.clone(),
        updated_at: now.clone(),
        completed_at: source.completed_at.as_ref().map(|_| now.clone()),
        ..source.clone()
    };
    repository::insert(&transaction, &copy)?;
    copy_details(&transaction, &source.id, &copy.id, &now)?;
    copy_subtasks(&transaction, &source, &copy, &now)?;

    let mut changes = ChangeSet::new();
    changes.track("source", None, Some(source.title.as_str()));
    record(&transaction, &copy.id, ActivityAction::Duplicated, changes)?;
    transaction.commit()?;
    Ok(copy)
}

fn copy_title(title: &str) -> String {
    let suffix_length = COPY_SUFFIX.chars().count();
    let room = TITLE_MAX_LENGTH.saturating_sub(suffix_length);
    let base: String = title.chars().take(room).collect();
    format!("{}{COPY_SUFFIX}", base.trim_end())
}

fn copy_subtasks(connection: &Connection, source: &Task, copy: &Task, now: &str) -> AppResult<()> {
    for original in repository::list_subtasks(connection, &source.id)? {
        let duplicate = Task {
            id: id::new_id(),
            parent_task_id: Some(copy.id.clone()),
            created_at: now.to_string(),
            updated_at: now.to_string(),
            completed_at: None,
            ..original.clone()
        };
        repository::insert(connection, &duplicate)?;
        copy_details(connection, &original.id, &duplicate.id, now)?;
    }
    Ok(())
}

fn copy_details(
    connection: &Connection,
    from_task_id: &str,
    to_task_id: &str,
    now: &str,
) -> AppResult<()> {
    for item in checklist_repository::list_by_task(connection, from_task_id)? {
        let copied = ChecklistItem {
            id: id::new_id(),
            task_id: to_task_id.to_string(),
            is_done: false,
            created_at: now.to_string(),
            updated_at: now.to_string(),
            ..item
        };
        checklist_repository::insert(connection, &copied)?;
    }
    for tag in tag_repository::list_by_task(connection, from_task_id)? {
        tag_repository::assign(connection, to_task_id, &tag.id)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{connection::open_in_memory, migrations};
    use crate::modules::activity::models::{ActivityEntry, EntityType};
    use crate::modules::activity::service as activity;
    use crate::modules::boards::models::{BoardDetails, ColumnKind, CreateBoardInput, NewColumn};
    use crate::modules::boards::service as boards;
    use crate::modules::checklist::models::{CreateChecklistItemInput, UpdateChecklistItemInput};
    use crate::modules::checklist::service as checklist;
    use crate::modules::comments::models::CreateCommentInput;
    use crate::modules::comments::service as comments;
    use crate::modules::tags::models::CreateTagInput;
    use crate::modules::tags::service as tags;
    use crate::modules::tasks::models::{CreateSubtaskInput, CreateTaskInput, TaskPriority};
    use crate::modules::tasks::{service as tasks, subtask_service as subtasks};

    const NOW: &str = "2026-11-08T10:00:00.000Z";

    fn state() -> AppState {
        let mut connection = open_in_memory().expect("opens");
        migrations::run(&mut connection).expect("migrates");
        connection
            .execute(
                "INSERT INTO projects (id, name, created_at, updated_at) VALUES ('p1', 'P', ?1, ?1)",
                [NOW],
            )
            .expect("project");
        AppState::new(connection, None)
    }

    fn board(state: &AppState) -> BoardDetails {
        boards::create(
            state,
            CreateBoardInput {
                project_id: "p1".into(),
                name: "B".into(),
                columns: Some(vec![
                    NewColumn::new("Todo", ColumnKind::Todo),
                    NewColumn::new("Done", ColumnKind::Done),
                ]),
            },
        )
        .expect("creates board")
    }

    fn task_in(state: &AppState, column_id: Option<&str>, title: &str) -> Task {
        tasks::create(
            state,
            CreateTaskInput {
                project_id: "p1".into(),
                title: title.into(),
                description: Some("Details".into()),
                priority: Some(TaskPriority::High),
                due_date: Some("2026-12-01".into()),
                column_id: column_id.map(str::to_string),
            },
        )
        .expect("creates task")
    }

    fn add_item(state: &AppState, task_id: &str, text: &str) -> ChecklistItem {
        checklist::create(
            state,
            CreateChecklistItemInput {
                task_id: task_id.into(),
                text: text.into(),
            },
        )
        .expect("adds item")
    }

    fn add_subtask(state: &AppState, parent_id: &str, title: &str) -> Task {
        subtasks::create(
            state,
            CreateSubtaskInput {
                parent_task_id: parent_id.into(),
                title: title.into(),
            },
        )
        .expect("adds subtask")
    }

    fn add_tag(state: &AppState, name: &str) -> String {
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

    fn item_texts(state: &AppState, task_id: &str) -> Vec<(String, bool)> {
        checklist::list(state, task_id)
            .expect("lists")
            .into_iter()
            .map(|item| (item.text, item.is_done))
            .collect()
    }

    fn tag_names(state: &AppState, task_id: &str) -> Vec<String> {
        tags::list_for_task(state, task_id)
            .expect("lists")
            .into_iter()
            .map(|tag| tag.name)
            .collect()
    }

    fn titles_in_column(state: &AppState, board_id: &str, column_id: &str) -> Vec<String> {
        tasks::list_by_board(state, board_id)
            .expect("lists")
            .into_iter()
            .filter(|task| task.column_id.as_deref() == Some(column_id))
            .map(|task| task.title)
            .collect()
    }

    fn task_entries(state: &AppState) -> Vec<ActivityEntry> {
        let mut all = activity::recent(state, Some(100)).expect("reads activity");
        all.reverse();
        all.into_iter()
            .filter(|entry| entry.entity_type == EntityType::Task)
            .collect()
    }

    #[test]
    fn the_copy_keeps_the_fields_and_lands_right_after_the_original() {
        let state = state();
        let details = board(&state);
        let column = details.columns[0].id.clone();
        let first = task_in(&state, Some(&column), "First");
        task_in(&state, Some(&column), "Last");

        let copy = duplicate(&state, &first.id, None).expect("duplicates");

        assert_ne!(copy.id, first.id);
        assert_eq!(copy.title, "First (copy)");
        assert_eq!(copy.description, "Details");
        assert_eq!(copy.priority, TaskPriority::High);
        assert_eq!(copy.due_date.as_deref(), Some("2026-12-01"));
        assert_eq!(
            (copy.board_id.clone(), copy.column_id.clone()),
            (first.board_id.clone(), first.column_id.clone())
        );
        assert_eq!(
            titles_in_column(&state, &details.board.id, &column),
            ["First", "First (copy)", "Last"]
        );
        assert_eq!(copy.archived_at, None);
        assert_eq!(copy.parent_task_id, None);
    }

    #[test]
    fn a_backlog_task_is_copied_into_the_backlog_after_the_original() {
        let state = state();
        let first = task_in(&state, None, "First");
        task_in(&state, None, "Last");

        let copy = duplicate(&state, &first.id, Some("  Renamed copy  ".into())).expect("copies");

        assert_eq!(copy.title, "Renamed copy");
        assert_eq!(
            (copy.board_id.clone(), copy.column_id.clone()),
            (None, None)
        );
        let slots = repository::list_backlog_slots(&state.database(), "p1").expect("reads");
        let ids: Vec<&str> = slots.iter().map(|slot| slot.id.as_str()).collect();
        assert_eq!(ids.len(), 3);
        assert_eq!(ids[1], copy.id);
    }

    #[test]
    fn the_default_title_is_truncated_to_fit_the_limit() {
        let state = state();
        let long = "x".repeat(TITLE_MAX_LENGTH);
        let source = task_in(&state, None, &long);

        let copy = duplicate(&state, &source.id, None).expect("duplicates");

        assert_eq!(copy.title.chars().count(), TITLE_MAX_LENGTH);
        assert!(copy.title.ends_with(COPY_SUFFIX));
    }

    #[test]
    fn an_explicit_title_is_validated() {
        let state = state();
        let source = task_in(&state, None, "A");

        let blank = duplicate(&state, &source.id, Some("  ".into()));
        let long = duplicate(&state, &source.id, Some("y".repeat(TITLE_MAX_LENGTH + 1)));

        assert!(matches!(blank, Err(AppError::Validation(_))));
        assert!(matches!(long, Err(AppError::Validation(_))));
    }

    #[test]
    fn checklist_is_copied_as_open_items_in_the_same_order() {
        let state = state();
        let source = task_in(&state, None, "A");
        let first = add_item(&state, &source.id, "One");
        add_item(&state, &source.id, "Two");
        checklist::update(
            &state,
            &first.id,
            UpdateChecklistItemInput {
                is_done: Some(true),
                ..Default::default()
            },
        )
        .expect("completes");

        let copy = duplicate(&state, &source.id, None).expect("duplicates");

        assert_eq!(
            item_texts(&state, &copy.id),
            [("One".to_string(), false), ("Two".to_string(), false)]
        );
        assert_eq!(
            item_texts(&state, &source.id),
            [("One".to_string(), true), ("Two".to_string(), false)]
        );
    }

    #[test]
    fn tags_are_shared_and_the_original_keeps_its_own() {
        let state = state();
        let source = task_in(&state, None, "A");
        let bug = add_tag(&state, "bug");
        let ui = add_tag(&state, "ui");
        tags::assign(&state, &source.id, &bug).expect("assigns");
        tags::assign(&state, &source.id, &ui).expect("assigns");

        let copy = duplicate(&state, &source.id, None).expect("duplicates");
        tags::unassign(&state, &copy.id, &bug).expect("unassigns");

        assert_eq!(tag_names(&state, &copy.id), ["ui"]);
        assert_eq!(tag_names(&state, &source.id), ["bug", "ui"]);
    }

    #[test]
    fn subtasks_are_copied_open_with_their_own_checklist_and_tags() {
        let state = state();
        let source = task_in(&state, None, "A");
        let first = add_subtask(&state, &source.id, "Step 1");
        add_subtask(&state, &source.id, "Step 2");
        subtasks::set_done(&state, &first.id, true).expect("completes");
        add_item(&state, &first.id, "Detail");
        let bug = add_tag(&state, "bug");
        tags::assign(&state, &first.id, &bug).expect("assigns");

        let copy = duplicate(&state, &source.id, None).expect("duplicates");

        let copied = subtasks::list(&state, &copy.id).expect("lists");
        let summary: Vec<(&str, bool)> = copied
            .iter()
            .map(|task| (task.title.as_str(), task.completed_at.is_some()))
            .collect();
        assert_eq!(summary, [("Step 1", false), ("Step 2", false)]);
        assert!(
            copied
                .iter()
                .all(|task| task.parent_task_id.as_deref() == Some(copy.id.as_str()))
        );
        assert_eq!(
            item_texts(&state, &copied[0].id),
            [("Detail".to_string(), false)]
        );
        assert_eq!(tag_names(&state, &copied[0].id), ["bug"]);
        let originals = subtasks::list(&state, &source.id).expect("lists");
        assert!(originals[0].completed_at.is_some());
        assert_ne!(originals[0].id, copied[0].id);
    }

    #[test]
    fn comments_are_not_copied() {
        let state = state();
        let source = task_in(&state, None, "A");
        comments::create(
            &state,
            CreateCommentInput {
                task_id: source.id.clone(),
                body: "note".into(),
            },
        )
        .expect("comments");

        let copy = duplicate(&state, &source.id, None).expect("duplicates");

        assert!(comments::list(&state, &copy.id).expect("lists").is_empty());
    }

    #[test]
    fn a_copy_in_a_done_column_is_stamped_as_completed_now() {
        let state = state();
        let details = board(&state);
        let source = task_in(&state, Some(&details.columns[1].id), "Shipped");
        assert!(source.completed_at.is_some());

        let copy = duplicate(&state, &source.id, None).expect("duplicates");

        assert_eq!(copy.completed_at.as_deref(), Some(copy.created_at.as_str()));
    }

    #[test]
    fn subtasks_archived_and_missing_tasks_cannot_be_duplicated() {
        let state = state();
        let source = task_in(&state, None, "A");
        let step = add_subtask(&state, &source.id, "Step");
        let archived = task_in(&state, None, "Old");
        tasks::archive(&state, &archived.id).expect("archives");

        assert!(matches!(
            duplicate(&state, &step.id, None),
            Err(AppError::Validation(_))
        ));
        assert!(matches!(
            duplicate(&state, &archived.id, None),
            Err(AppError::Conflict(_))
        ));
        assert!(matches!(
            duplicate(&state, "ghost", None),
            Err(AppError::NotFound(_))
        ));
    }

    #[test]
    fn the_history_records_one_duplicated_entry_on_the_copy_only() {
        let state = state();
        let source = task_in(&state, None, "Original");
        add_item(&state, &source.id, "One");
        add_subtask(&state, &source.id, "Step");
        let before = task_entries(&state).len();

        let copy = duplicate(&state, &source.id, None).expect("duplicates");

        let logged = task_entries(&state);
        assert_eq!(logged.len(), before + 1);
        let last = logged.last().expect("has entries");
        assert_eq!(last.action, ActivityAction::Duplicated);
        assert_eq!(last.entity_id, copy.id);
        assert_eq!(
            last.changes.as_ref().expect("has changes")["source"]
                .to
                .as_deref(),
            Some("Original")
        );
    }

    #[test]
    fn a_failing_activity_write_leaves_no_partial_copy_behind() {
        let state = state();
        let source = task_in(&state, None, "A");
        add_item(&state, &source.id, "One");
        add_subtask(&state, &source.id, "Step");
        state
            .database()
            .execute_batch("DROP TABLE activity_log;")
            .expect("drops log table");

        let result = duplicate(&state, &source.id, None);

        assert!(result.is_err());
        let task_count: i64 = state
            .database()
            .query_row("SELECT COUNT(*) FROM tasks", [], |row| row.get(0))
            .expect("counts");
        let item_count: i64 = state
            .database()
            .query_row("SELECT COUNT(*) FROM checklist_items", [], |row| row.get(0))
            .expect("counts");
        assert_eq!((task_count, item_count), (2, 1));
    }
}
