use chrono::NaiveDate;
use rusqlite::Connection;

use super::models::{CreateTaskInput, Task, TaskPriority, UpdateTaskInput};
use super::repository::{self, TaskSlot};
use crate::error::{AppError, AppResult};
use crate::modules::activity::models::{ActivityAction, ChangeSet, EntityType};
use crate::modules::activity::service as activity;
use crate::modules::boards::models::ColumnKind;
use crate::shared::text::{optional_text, require_text, text_or_empty};
use crate::shared::{files, id, position, time};
use crate::state::AppState;

pub const TITLE_MAX_LENGTH: usize = 200;
pub const DESCRIPTION_MAX_LENGTH: usize = 20_000;
const DATE_FORMAT: &str = "%Y-%m-%d";
const DATE_LENGTH: usize = 10;
const PREVIEW_LENGTH: usize = 120;

pub fn create(state: &AppState, input: CreateTaskInput) -> AppResult<Task> {
    let title = require_text("task title", &input.title, TITLE_MAX_LENGTH)?;
    let description = normalize_description(input.description)?;
    let due_date = normalize_due_date(input.due_date)?;

    let mut connection = state.database();
    let transaction = connection.transaction()?;
    let project_exists = repository::project_exists(&transaction, &input.project_id)?;
    if !project_exists {
        return Err(AppError::NotFound("project".into()));
    }

    let (board_id, column_id, siblings, lands_in_done) = match &input.column_id {
        Some(column_id) => {
            let column = repository::find_column_info(&transaction, column_id)?
                .ok_or_else(|| AppError::NotFound("column".into()))?;
            let is_foreign_column = column.project_id != input.project_id;
            if is_foreign_column {
                return Err(AppError::Validation(
                    "column belongs to a different project".into(),
                ));
            }
            let slots = repository::list_column_slots(&transaction, &column.id)?;
            let lands_in_done = column.kind == ColumnKind::Done;
            (Some(column.board_id), Some(column.id), slots, lands_in_done)
        }
        None => {
            let slots = repository::list_backlog_slots(&transaction, &input.project_id)?;
            (None, None, slots, false)
        }
    };

    let now = time::now();
    let task = Task {
        id: id::new_id(),
        project_id: input.project_id,
        board_id,
        column_id,
        parent_task_id: None,
        title,
        description,
        priority: input.priority.unwrap_or(TaskPriority::Medium),
        due_date,
        position: end_position(&siblings)?,
        created_at: now.clone(),
        updated_at: now.clone(),
        completed_at: lands_in_done.then_some(now),
        archived_at: None,
    };
    repository::insert(&transaction, &task)?;
    let mut changes = ChangeSet::new();
    changes.track("title", None, Some(task.title.as_str()));
    record(&transaction, &task.id, ActivityAction::Created, changes)?;
    transaction.commit()?;
    Ok(task)
}

pub fn get(state: &AppState, id: &str) -> AppResult<Task> {
    let connection = state.database();
    find_existing(&connection, id)
}

pub fn list_by_board(state: &AppState, board_id: &str) -> AppResult<Vec<Task>> {
    let connection = state.database();
    let board_exists = repository::board_exists(&connection, board_id)?;
    if !board_exists {
        return Err(AppError::NotFound("board".into()));
    }
    repository::list_by_board(&connection, board_id)
}

pub fn update(state: &AppState, id: &str, input: UpdateTaskInput) -> AppResult<Task> {
    let mut connection = state.database();
    let transaction = connection.transaction()?;
    let current = find_existing(&transaction, id)?;
    let changed = apply_update(&current, input)?;
    let changes = diff(&current, &changed);

    let has_changes = !changes.is_empty();
    if !has_changes {
        return Ok(current);
    }

    let updated = Task {
        updated_at: time::now(),
        ..changed
    };
    repository::update_fields(&transaction, &updated)?;
    record(&transaction, id, ActivityAction::Updated, changes)?;
    transaction.commit()?;
    Ok(updated)
}

pub fn archive(state: &AppState, id: &str) -> AppResult<Task> {
    let mut connection = state.database();
    let transaction = connection.transaction()?;
    let current = find_existing(&transaction, id)?;
    reject_subtask(&current, "archived")?;

    let is_already_archived = current.archived_at.is_some();
    if is_already_archived {
        return Ok(current);
    }

    let now = time::now();
    repository::set_archived_at(&transaction, id, Some(&now), &current.position, &now)?;
    record(&transaction, id, ActivityAction::Archived, ChangeSet::new())?;
    let archived = find_existing(&transaction, id)?;
    transaction.commit()?;
    Ok(archived)
}

pub fn restore(state: &AppState, id: &str) -> AppResult<Task> {
    let mut connection = state.database();
    let transaction = connection.transaction()?;
    let current = find_existing(&transaction, id)?;
    reject_subtask(&current, "restored")?;

    let is_archived = current.archived_at.is_some();
    if !is_archived {
        return Ok(current);
    }

    let siblings = visible_siblings(&transaction, &current)?;
    let restored_position = end_position(&siblings)?;
    repository::set_archived_at(&transaction, id, None, &restored_position, &time::now())?;
    record(&transaction, id, ActivityAction::Restored, ChangeSet::new())?;
    let restored = find_existing(&transaction, id)?;
    transaction.commit()?;
    Ok(restored)
}

pub fn delete(state: &AppState, id: &str) -> AppResult<()> {
    let stored_names = {
        let mut connection = state.database();
        let transaction = connection.transaction()?;
        let current = find_existing(&transaction, id)?;
        let stored_names = repository::find_attachment_stored_names(&transaction, id)?;
        let mut changes = ChangeSet::new();
        changes.track("title", Some(current.title.as_str()), None);
        record(&transaction, id, ActivityAction::Deleted, changes)?;
        repository::delete(&transaction, id)?;
        transaction.commit()?;
        stored_names
    };

    if let Some(directory) = state.attachments_directory() {
        files::remove_stored_files(directory, &stored_names);
    }
    Ok(())
}

fn reject_subtask(task: &Task, verb: &str) -> AppResult<()> {
    let is_subtask = task.parent_task_id.is_some();
    if is_subtask {
        return Err(AppError::Validation(format!(
            "subtasks cannot be {verb}; delete the subtask or {} its parent",
            if verb == "archived" {
                "archive"
            } else {
                "restore"
            }
        )));
    }
    Ok(())
}

pub(super) fn find_existing(connection: &Connection, id: &str) -> AppResult<Task> {
    repository::find_by_id(connection, id)?.ok_or_else(|| AppError::NotFound("task".into()))
}

pub(super) fn record(
    connection: &Connection,
    task_id: &str,
    action: ActivityAction,
    changes: ChangeSet,
) -> AppResult<()> {
    activity::record(connection, EntityType::Task, task_id, action, changes)
}

pub(super) fn end_position(siblings: &[TaskSlot]) -> AppResult<String> {
    match siblings.last() {
        Some(last) => position::after(&last.position),
        None => Ok(position::first()),
    }
}

pub(super) fn visible_siblings(connection: &Connection, task: &Task) -> AppResult<Vec<TaskSlot>> {
    match &task.column_id {
        Some(column_id) => repository::list_column_slots(connection, column_id),
        None => repository::list_backlog_slots(connection, &task.project_id),
    }
}

fn apply_update(current: &Task, input: UpdateTaskInput) -> AppResult<Task> {
    let mut task = current.clone();
    if let Some(title) = input.title {
        task.title = require_text("task title", &title, TITLE_MAX_LENGTH)?;
    }
    if let Some(description) = input.description {
        task.description = normalize_description(Some(description))?;
    }
    if let Some(priority) = input.priority {
        task.priority = priority;
    }
    if let Some(due_date) = input.due_date {
        task.due_date = normalize_due_date(due_date)?;
    }
    Ok(task)
}

fn diff(before: &Task, after: &Task) -> ChangeSet {
    let mut changes = ChangeSet::new();
    changes.track(
        "title",
        Some(before.title.as_str()),
        Some(after.title.as_str()),
    );
    let before_preview = preview(&before.description);
    let after_preview = preview(&after.description);
    let description_changed = before.description != after.description;
    if description_changed {
        changes.track(
            "description",
            Some(before_preview.as_str()),
            Some(after_preview.as_str()),
        );
    }
    changes.track(
        "priority",
        Some(before.priority.as_str()),
        Some(after.priority.as_str()),
    );
    changes.track(
        "dueDate",
        before.due_date.as_deref(),
        after.due_date.as_deref(),
    );
    changes
}

fn preview(text: &str) -> String {
    let is_short = text.chars().count() <= PREVIEW_LENGTH;
    if is_short {
        return text.to_string();
    }
    let head: String = text.chars().take(PREVIEW_LENGTH).collect();
    format!("{head}…")
}

fn normalize_description(description: Option<String>) -> AppResult<String> {
    let text = text_or_empty(description);
    let is_too_long = text.chars().count() > DESCRIPTION_MAX_LENGTH;
    if is_too_long {
        return Err(AppError::Validation(format!(
            "task description cannot exceed {DESCRIPTION_MAX_LENGTH} characters"
        )));
    }
    Ok(text)
}

fn normalize_due_date(due_date: Option<String>) -> AppResult<Option<String>> {
    let Some(text) = optional_text(due_date) else {
        return Ok(None);
    };
    let has_expected_length = text.len() == DATE_LENGTH;
    let is_valid_date = NaiveDate::parse_from_str(&text, DATE_FORMAT).is_ok();
    let is_valid = has_expected_length && is_valid_date;
    if !is_valid {
        return Err(AppError::Validation(
            "due date must be a date in YYYY-MM-DD format".into(),
        ));
    }
    Ok(Some(text))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{connection::open_in_memory, migrations};
    use crate::modules::activity::models::ActivityEntry;
    use crate::modules::boards::models::{BoardDetails, ColumnKind, CreateBoardInput, NewColumn};
    use crate::modules::boards::service as boards;
    use std::time::Duration;

    const NOW: &str = "2026-11-08T10:00:00.000Z";

    /// Test convention: "Todo" is a todo stage, "Done" is the done stage, anything else is in progress.
    fn kind_of(name: &str) -> ColumnKind {
        match name {
            "Todo" => ColumnKind::Todo,
            "Done" => ColumnKind::Done,
            _ => ColumnKind::InProgress,
        }
    }

    fn named_columns(names: &[&str]) -> Vec<NewColumn> {
        names
            .iter()
            .map(|name| NewColumn::new(name, kind_of(name)))
            .collect()
    }

    fn state() -> AppState {
        let mut connection = open_in_memory().expect("opens");
        migrations::run(&mut connection).expect("migrates");
        for id in ["p1", "p2"] {
            connection
                .execute(
                    "INSERT INTO projects (id, name, created_at, updated_at) VALUES (?1, ?1, ?2, ?2)",
                    (id, NOW),
                )
                .expect("project");
        }
        AppState::new(connection, None)
    }

    fn board(state: &AppState, project_id: &str, columns: &[&str]) -> BoardDetails {
        boards::create(
            state,
            CreateBoardInput {
                project_id: project_id.into(),
                name: "Board".into(),
                columns: Some(named_columns(columns)),
            },
        )
        .expect("creates board")
    }

    fn input(project_id: &str, title: &str) -> CreateTaskInput {
        CreateTaskInput {
            project_id: project_id.into(),
            title: title.into(),
            description: None,
            priority: None,
            due_date: None,
            column_id: None,
        }
    }

    fn create_in_backlog(state: &AppState, project_id: &str, title: &str) -> Task {
        create(state, input(project_id, title)).expect("creates")
    }

    fn create_in_column(state: &AppState, project_id: &str, column_id: &str, title: &str) -> Task {
        let with_column = CreateTaskInput {
            column_id: Some(column_id.into()),
            ..input(project_id, title)
        };
        create(state, with_column).expect("creates")
    }

    fn entries(state: &AppState) -> Vec<ActivityEntry> {
        let mut all = activity::recent(state, Some(100)).expect("reads activity");
        all.reverse();
        all
    }

    fn task_entries(state: &AppState) -> Vec<ActivityEntry> {
        entries(state)
            .into_iter()
            .filter(|entry| entry.entity_type == EntityType::Task)
            .collect()
    }

    fn count(state: &AppState, table: &str) -> i64 {
        state
            .database()
            .query_row(&format!("SELECT COUNT(*) FROM {table}"), [], |row| {
                row.get(0)
            })
            .expect("counts")
    }

    fn tick() {
        std::thread::sleep(Duration::from_millis(3));
    }

    #[test]
    fn create_without_a_column_lands_in_the_backlog_with_defaults() {
        let state = state();

        let task = create_in_backlog(&state, "p1", "  Write docs  ");

        assert_eq!(task.title, "Write docs");
        assert_eq!(task.description, "");
        assert_eq!(task.priority, TaskPriority::Medium);
        assert_eq!(task.due_date, None);
        assert_eq!(
            (task.board_id.clone(), task.column_id.clone()),
            (None, None)
        );
        assert_eq!(task.parent_task_id, None);
        assert_eq!(task.completed_at, None);
        assert_eq!(task.archived_at, None);
        assert_eq!(task.created_at, task.updated_at);
        assert_eq!(task.id.len(), 36);
        assert_eq!(get(&state, &task.id).expect("reads"), task);
    }

    #[test]
    fn create_stores_every_optional_field() {
        let state = state();
        let full = CreateTaskInput {
            description: Some("  details  ".into()),
            priority: Some(TaskPriority::Urgent),
            due_date: Some("2026-12-24".into()),
            ..input("p1", "Ship")
        };

        let task = create(&state, full).expect("creates");

        assert_eq!(task.description, "details");
        assert_eq!(task.priority, TaskPriority::Urgent);
        assert_eq!(task.due_date.as_deref(), Some("2026-12-24"));
    }

    #[test]
    fn create_in_a_column_sets_board_and_column_and_appends_at_the_end() {
        let state = state();
        let details = board(&state, "p1", &["Todo", "Done"]);
        let todo = details.columns[0].id.clone();

        let first = create_in_column(&state, "p1", &todo, "First");
        let second = create_in_column(&state, "p1", &todo, "Second");

        assert_eq!(first.board_id.as_deref(), Some(details.board.id.as_str()));
        assert_eq!(first.column_id.as_deref(), Some(todo.as_str()));
        assert!(second.position > first.position);
        let listed = list_by_board(&state, &details.board.id).expect("lists");
        let titles: Vec<&str> = listed.iter().map(|task| task.title.as_str()).collect();
        assert_eq!(titles, ["First", "Second"]);
    }

    #[test]
    fn backlog_positions_are_independent_per_project() {
        let state = state();

        let first = create_in_backlog(&state, "p1", "A");
        let second = create_in_backlog(&state, "p1", "B");
        let other = create_in_backlog(&state, "p2", "C");

        assert!(second.position > first.position);
        assert_eq!(other.position, first.position);
    }

    #[test]
    fn create_validates_title_description_and_due_date() {
        let state = state();
        let long_title = "t".repeat(TITLE_MAX_LENGTH + 1);
        let long_description = Some("d".repeat(DESCRIPTION_MAX_LENGTH + 1));
        let at_limit = CreateTaskInput {
            description: Some("d".repeat(DESCRIPTION_MAX_LENGTH)),
            ..input("p1", "ok")
        };

        assert!(matches!(
            create(&state, input("p1", "   ")),
            Err(AppError::Validation(_))
        ));
        assert!(matches!(
            create(&state, input("p1", &long_title)),
            Err(AppError::Validation(_))
        ));
        assert!(matches!(
            create(
                &state,
                CreateTaskInput {
                    description: long_description,
                    ..input("p1", "x")
                }
            ),
            Err(AppError::Validation(_))
        ));
        for invalid in [
            "08/11/2026",
            "tomorrow",
            "2026-02-30",
            "2026-1-5",
            "2026-11-08T10:00",
        ] {
            let with_date = CreateTaskInput {
                due_date: Some(invalid.into()),
                ..input("p1", "x")
            };
            assert!(
                matches!(create(&state, with_date), Err(AppError::Validation(_))),
                "{invalid:?} should be rejected"
            );
        }
        assert!(create(&state, at_limit).is_ok());
        assert_eq!(count(&state, "tasks"), 1);
    }

    #[test]
    fn a_blank_due_date_is_treated_as_no_due_date() {
        let state = state();
        let blank = CreateTaskInput {
            due_date: Some("   ".into()),
            ..input("p1", "x")
        };

        let task = create(&state, blank).expect("creates");

        assert_eq!(task.due_date, None);
    }

    #[test]
    fn create_rejects_unknown_project_unknown_column_and_foreign_column() {
        let state = state();
        let details = board(&state, "p2", &["Todo"]);
        let foreign_column = details.columns[0].id.clone();

        let unknown_project = create(&state, input("missing", "x"));
        let unknown_column = create(
            &state,
            CreateTaskInput {
                column_id: Some("missing".into()),
                ..input("p1", "x")
            },
        );
        let foreign = create(
            &state,
            CreateTaskInput {
                column_id: Some(foreign_column),
                ..input("p1", "x")
            },
        );

        assert!(matches!(unknown_project, Err(AppError::NotFound(_))));
        assert!(matches!(unknown_column, Err(AppError::NotFound(_))));
        assert!(matches!(foreign, Err(AppError::Validation(_))));
        assert_eq!(count(&state, "tasks"), 0);
    }

    #[test]
    fn create_logs_a_created_entry_with_the_title() {
        let state = state();

        let task = create_in_backlog(&state, "p1", "Write docs");

        let logged = task_entries(&state);
        assert_eq!(logged.len(), 1);
        assert_eq!(logged[0].entity_id, task.id);
        assert_eq!(logged[0].action, ActivityAction::Created);
        let changes = logged[0].changes.as_ref().expect("has changes");
        assert_eq!(changes["title"].to.as_deref(), Some("Write docs"));
    }

    #[test]
    fn a_failing_activity_write_leaves_no_task_behind() {
        let state = state();
        state
            .database()
            .execute_batch("DROP TABLE activity_log;")
            .expect("drops log table");

        let result = create(&state, input("p1", "Ghost"));

        assert!(result.is_err());
        assert_eq!(count(&state, "tasks"), 0);
    }

    #[test]
    fn get_of_unknown_task_is_not_found() {
        let state = state();

        assert!(matches!(get(&state, "missing"), Err(AppError::NotFound(_))));
    }

    #[test]
    fn update_changes_content_and_bumps_updated_at_but_keeps_placement() {
        let state = state();
        let details = board(&state, "p1", &["Todo"]);
        let created = create_in_column(&state, "p1", &details.columns[0].id, "Old");
        tick();
        let patch = UpdateTaskInput {
            title: Some(" New ".into()),
            description: Some("desc".into()),
            priority: Some(TaskPriority::High),
            due_date: Some(Some("2026-12-01".into())),
        };

        let updated = update(&state, &created.id, patch).expect("updates");

        assert_eq!(updated.title, "New");
        assert_eq!(updated.description, "desc");
        assert_eq!(updated.priority, TaskPriority::High);
        assert_eq!(updated.due_date.as_deref(), Some("2026-12-01"));
        assert!(updated.updated_at > created.updated_at);
        assert_eq!(updated.created_at, created.created_at);
        assert_eq!(updated.position, created.position);
        assert_eq!(updated.column_id, created.column_id);
        assert_eq!(get(&state, &created.id).expect("reads"), updated);
    }

    #[test]
    fn update_can_set_and_clear_the_due_date() {
        let state = state();
        let created = create_in_backlog(&state, "p1", "T");
        let set = UpdateTaskInput {
            due_date: Some(Some("2026-12-01".into())),
            ..Default::default()
        };
        let clear = UpdateTaskInput {
            due_date: Some(None),
            ..Default::default()
        };

        let with_date = update(&state, &created.id, set).expect("sets");
        let without_date = update(&state, &created.id, clear).expect("clears");

        assert_eq!(with_date.due_date.as_deref(), Some("2026-12-01"));
        assert_eq!(without_date.due_date, None);
    }

    #[test]
    fn update_logs_only_changed_fields() {
        let state = state();
        let created = create_in_backlog(&state, "p1", "Old");
        let patch = UpdateTaskInput {
            title: Some("New".into()),
            priority: Some(TaskPriority::Low),
            description: Some(String::new()),
            ..Default::default()
        };

        update(&state, &created.id, patch).expect("updates");

        let logged = task_entries(&state);
        assert_eq!(logged[1].action, ActivityAction::Updated);
        let changes = logged[1].changes.as_ref().expect("has changes");
        let mut fields: Vec<&str> = changes.keys().map(String::as_str).collect();
        fields.sort_unstable();
        assert_eq!(fields, ["priority", "title"]);
        assert_eq!(changes["priority"].from.as_deref(), Some("medium"));
        assert_eq!(changes["priority"].to.as_deref(), Some("low"));
    }

    #[test]
    fn update_logs_due_date_set_and_cleared_as_null_on_one_side() {
        let state = state();
        let created = create_in_backlog(&state, "p1", "T");
        let set = UpdateTaskInput {
            due_date: Some(Some("2026-12-01".into())),
            ..Default::default()
        };
        let clear = UpdateTaskInput {
            due_date: Some(None),
            ..Default::default()
        };
        update(&state, &created.id, set).expect("sets");
        update(&state, &created.id, clear).expect("clears");

        let logged = task_entries(&state);
        let set_entry = logged[1].changes.as_ref().expect("has changes");
        let clear_entry = logged[2].changes.as_ref().expect("has changes");
        assert_eq!(set_entry["dueDate"].from, None);
        assert_eq!(set_entry["dueDate"].to.as_deref(), Some("2026-12-01"));
        assert_eq!(clear_entry["dueDate"].from.as_deref(), Some("2026-12-01"));
        assert_eq!(clear_entry["dueDate"].to, None);
    }

    #[test]
    fn update_logs_a_truncated_preview_of_long_descriptions() {
        let state = state();
        let created = create_in_backlog(&state, "p1", "T");
        let long = "x".repeat(500);

        update(
            &state,
            &created.id,
            UpdateTaskInput {
                description: Some(long),
                ..Default::default()
            },
        )
        .expect("updates");

        let logged = task_entries(&state);
        let changes = logged[1].changes.as_ref().expect("has changes");
        let preview = changes["description"].to.as_deref().expect("has preview");
        assert_eq!(preview.chars().count(), PREVIEW_LENGTH + 1);
        assert!(preview.ends_with('…'));
    }

    #[test]
    fn update_without_real_changes_logs_nothing_and_keeps_updated_at() {
        let state = state();
        let created = create_in_backlog(&state, "p1", "Same");
        tick();

        let same_title = UpdateTaskInput {
            title: Some("Same".into()),
            ..Default::default()
        };
        let nothing = UpdateTaskInput::default();
        let first = update(&state, &created.id, same_title).expect("updates");
        let second = update(&state, &created.id, nothing).expect("updates");

        assert_eq!(first, created);
        assert_eq!(second, created);
        assert_eq!(task_entries(&state).len(), 1);
    }

    #[test]
    fn update_rejects_invalid_input_without_changing_anything() {
        let state = state();
        let created = create_in_backlog(&state, "p1", "Keep");
        let bad_title = UpdateTaskInput {
            title: Some("  ".into()),
            priority: Some(TaskPriority::Urgent),
            ..Default::default()
        };
        let bad_date = UpdateTaskInput {
            due_date: Some(Some("soon".into())),
            ..Default::default()
        };

        assert!(matches!(
            update(&state, &created.id, bad_title),
            Err(AppError::Validation(_))
        ));
        assert!(matches!(
            update(&state, &created.id, bad_date),
            Err(AppError::Validation(_))
        ));
        assert!(matches!(
            update(&state, "missing", UpdateTaskInput::default()),
            Err(AppError::NotFound(_))
        ));
        assert_eq!(get(&state, &created.id).expect("reads"), created);
        assert_eq!(task_entries(&state).len(), 1);
    }

    #[test]
    fn archive_hides_the_task_from_the_board_but_keeps_its_column() {
        let state = state();
        let details = board(&state, "p1", &["Todo"]);
        let column = details.columns[0].id.clone();
        let task = create_in_column(&state, "p1", &column, "T");

        let archived = archive(&state, &task.id).expect("archives");

        assert!(archived.archived_at.is_some());
        assert_eq!(archived.column_id.as_deref(), Some(column.as_str()));
        assert!(
            list_by_board(&state, &details.board.id)
                .expect("lists")
                .is_empty()
        );
    }

    #[test]
    fn archive_and_restore_are_idempotent_and_logged_once() {
        let state = state();
        let task = create_in_backlog(&state, "p1", "T");

        archive(&state, &task.id).expect("archives");
        archive(&state, &task.id).expect("archives again");
        restore(&state, &task.id).expect("restores");
        restore(&state, &task.id).expect("restores again");

        let actions: Vec<ActivityAction> = task_entries(&state)
            .iter()
            .map(|entry| entry.action)
            .collect();
        assert_eq!(
            actions,
            [
                ActivityAction::Created,
                ActivityAction::Archived,
                ActivityAction::Restored
            ]
        );
    }

    #[test]
    fn restore_puts_the_task_at_the_end_of_its_column() {
        let state = state();
        let details = board(&state, "p1", &["Todo"]);
        let column = details.columns[0].id.clone();
        let first = create_in_column(&state, "p1", &column, "First");
        create_in_column(&state, "p1", &column, "Second");
        archive(&state, &first.id).expect("archives");
        create_in_column(&state, "p1", &column, "Third");

        let restored = restore(&state, &first.id).expect("restores");

        let listed = list_by_board(&state, &details.board.id).expect("lists");
        let titles: Vec<&str> = listed.iter().map(|task| task.title.as_str()).collect();
        assert_eq!(titles, ["Second", "Third", "First"]);
        assert_eq!(restored.archived_at, None);
    }

    #[test]
    fn restore_puts_a_backlog_task_at_the_end_of_the_backlog() {
        let state = state();
        let first = create_in_backlog(&state, "p1", "First");
        let second = create_in_backlog(&state, "p1", "Second");
        archive(&state, &first.id).expect("archives");

        let restored = restore(&state, &first.id).expect("restores");

        assert!(restored.position > second.position);
    }

    #[test]
    fn archive_and_restore_of_unknown_task_are_not_found() {
        let state = state();

        assert!(matches!(
            archive(&state, "missing"),
            Err(AppError::NotFound(_))
        ));
        assert!(matches!(
            restore(&state, "missing"),
            Err(AppError::NotFound(_))
        ));
    }

    #[test]
    fn delete_removes_the_task_and_what_belongs_to_it() {
        let state = state();
        let parent = create_in_backlog(&state, "p1", "Parent");
        let other = create_in_backlog(&state, "p1", "Other");
        let connection = state.database();
        for sql in [
            format!(
                "INSERT INTO tasks (id, project_id, parent_task_id, title, position, created_at, updated_at) VALUES ('sub', 'p1', '{}', 'Sub', 'V', '{NOW}', '{NOW}')",
                parent.id
            ),
            format!(
                "INSERT INTO checklist_items (id, task_id, text, position, created_at, updated_at) VALUES ('i1', '{}', 'x', 'V', '{NOW}', '{NOW}')",
                parent.id
            ),
            format!(
                "INSERT INTO comments (id, task_id, body, created_at, updated_at) VALUES ('c1', '{}', 'hi', '{NOW}', '{NOW}')",
                parent.id
            ),
            format!(
                "INSERT INTO tags (id, name, created_at, updated_at) VALUES ('g1', 'tag', '{NOW}', '{NOW}')"
            ),
            format!(
                "INSERT INTO task_tags (task_id, tag_id) VALUES ('{}', 'g1')",
                parent.id
            ),
        ] {
            connection.execute(&sql, []).expect("seeds");
        }
        drop(connection);

        delete(&state, &parent.id).expect("deletes");

        assert_eq!(count(&state, "tasks"), 1);
        assert_eq!(count(&state, "checklist_items"), 0);
        assert_eq!(count(&state, "comments"), 0);
        assert_eq!(count(&state, "task_tags"), 0);
        assert_eq!(count(&state, "tags"), 1);
        assert!(get(&state, &other.id).is_ok());
    }

    #[test]
    fn delete_logs_the_title_and_the_entry_outlives_the_task() {
        let state = state();
        let task = create_in_backlog(&state, "p1", "Doomed");

        delete(&state, &task.id).expect("deletes");

        let logged = task_entries(&state);
        assert_eq!(logged[1].action, ActivityAction::Deleted);
        let changes = logged[1].changes.as_ref().expect("has changes");
        assert_eq!(changes["title"].from.as_deref(), Some("Doomed"));
        assert_eq!(changes["title"].to, None);
    }

    #[test]
    fn delete_removes_attachment_files_of_the_task_and_its_subtasks_only() {
        let directory = tempfile::tempdir().expect("temp dir");
        let state = state().with_attachments_directory(directory.path().to_path_buf());
        let doomed = create_in_backlog(&state, "p1", "Doomed");
        let kept = create_in_backlog(&state, "p1", "Kept");
        state
            .database()
            .execute(
                "INSERT INTO tasks (id, project_id, parent_task_id, title, position, created_at, updated_at) VALUES ('sub', 'p1', ?1, 'Sub', 'V', ?2, ?2)",
                (&doomed.id, NOW),
            )
            .expect("subtask");
        for (attachment, task, stored) in [
            ("a1", doomed.id.as_str(), "own-file"),
            ("a2", "sub", "child-file"),
            ("a3", kept.id.as_str(), "kept-file"),
        ] {
            state
                .database()
                .execute(
                    "INSERT INTO attachments (id, task_id, file_name, stored_name, mime_type, size_bytes, created_at) VALUES (?1, ?2, 'f', ?3, 'text/plain', 1, ?4)",
                    (attachment, task, stored, NOW),
                )
                .expect("attachment");
            std::fs::write(directory.path().join(stored), "data").expect("writes file");
        }

        delete(&state, &doomed.id).expect("deletes");

        assert!(!directory.path().join("own-file").exists());
        assert!(!directory.path().join("child-file").exists());
        assert!(directory.path().join("kept-file").exists());
    }

    #[test]
    fn delete_works_without_an_attachments_directory_and_for_unknown_ids() {
        let state = state();
        let task = create_in_backlog(&state, "p1", "T");

        assert!(delete(&state, &task.id).is_ok());
        assert!(matches!(
            delete(&state, &task.id),
            Err(AppError::NotFound(_))
        ));
    }

    #[test]
    fn a_failing_activity_write_keeps_the_task_from_being_deleted() {
        let state = state();
        let task = create_in_backlog(&state, "p1", "Survivor");
        state
            .database()
            .execute_batch("DROP TABLE activity_log;")
            .expect("drops log table");

        let result = delete(&state, &task.id);

        assert!(result.is_err());
        assert!(get(&state, &task.id).is_ok());
    }

    #[test]
    fn list_by_board_is_ordered_and_leaves_out_archived_tasks_and_subtasks() {
        let state = state();
        let details = board(&state, "p1", &["Todo", "Done"]);
        let todo = details.columns[0].id.clone();
        let done = details.columns[1].id.clone();
        let a = create_in_column(&state, "p1", &todo, "A");
        create_in_column(&state, "p1", &todo, "B");
        create_in_column(&state, "p1", &done, "C");
        let gone = create_in_column(&state, "p1", &todo, "Gone");
        archive(&state, &gone.id).expect("archives");
        state
            .database()
            .execute(
                "INSERT INTO tasks (id, project_id, board_id, column_id, parent_task_id, title, position, created_at, updated_at) VALUES ('sub', 'p1', ?1, ?2, ?3, 'Sub', 'V', ?4, ?4)",
                (&details.board.id, &todo, &a.id, NOW),
            )
            .expect("subtask");

        let listed = list_by_board(&state, &details.board.id).expect("lists");

        let titles: Vec<&str> = listed.iter().map(|task| task.title.as_str()).collect();
        let mut by_column = titles.clone();
        by_column.sort_unstable();
        assert_eq!(by_column, ["A", "B", "C"]);
        assert_eq!(
            listed
                .iter()
                .filter(|task| task.column_id.as_deref() == Some(todo.as_str()))
                .count(),
            2
        );
    }

    #[test]
    fn list_by_board_of_unknown_board_is_not_found() {
        let state = state();

        assert!(matches!(
            list_by_board(&state, "missing"),
            Err(AppError::NotFound(_))
        ));
    }

    #[test]
    fn creating_a_task_straight_into_a_done_column_stamps_completed_at() {
        let state = state();
        let details = board(&state, "p1", &["Todo", "Done"]);
        let in_column = |index: usize, title: &str| {
            create(
                &state,
                CreateTaskInput {
                    column_id: Some(details.columns[index].id.clone()),
                    ..input("p1", title)
                },
            )
            .expect("creates")
        };

        let open = in_column(0, "Open");
        let finished = in_column(1, "Finished");
        let idea = create_in_backlog(&state, "p1", "Idea");

        assert_eq!(open.completed_at, None);
        assert_eq!(idea.completed_at, None);
        assert_eq!(
            finished.completed_at.as_deref(),
            Some(finished.created_at.as_str())
        );
    }
}
