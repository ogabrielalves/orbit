use rusqlite::Connection;

use super::models::{Comment, CreateCommentInput};
use super::repository;
use crate::error::{AppError, AppResult};
use crate::modules::activity::models::{ActivityAction, ChangeSet, EntityType};
use crate::modules::activity::service as activity;
use crate::modules::tasks::repository as task_repository;
use crate::shared::text::require_text;
use crate::shared::{id, time};
use crate::state::AppState;

pub const COMMENT_MAX_LENGTH: usize = 10_000;
const PREVIEW_LENGTH: usize = 120;

pub fn create(state: &AppState, input: CreateCommentInput) -> AppResult<Comment> {
    let body = require_text("comment", &input.body, COMMENT_MAX_LENGTH)?;

    let mut connection = state.database();
    let transaction = connection.transaction()?;
    ensure_task_exists(&transaction, &input.task_id)?;

    let now = time::now();
    let comment = Comment {
        id: id::new_id(),
        task_id: input.task_id,
        body,
        created_at: now.clone(),
        updated_at: now,
    };
    repository::insert(&transaction, &comment)?;
    let mut changes = ChangeSet::new();
    let body_preview = preview(&comment.body);
    changes.track("body", None, Some(body_preview.as_str()));
    record(&transaction, &comment.id, ActivityAction::Created, changes)?;
    transaction.commit()?;
    Ok(comment)
}

pub fn list(state: &AppState, task_id: &str) -> AppResult<Vec<Comment>> {
    let connection = state.database();
    ensure_task_exists(&connection, task_id)?;
    repository::list_by_task(&connection, task_id)
}

pub fn update(state: &AppState, id: &str, body: &str) -> AppResult<Comment> {
    let body = require_text("comment", body, COMMENT_MAX_LENGTH)?;

    let mut connection = state.database();
    let transaction = connection.transaction()?;
    let current = find_existing(&transaction, id)?;

    let has_changes = current.body != body;
    if !has_changes {
        return Ok(current);
    }

    let updated_at = time::now();
    repository::update_body(&transaction, id, &body, &updated_at)?;
    let mut changes = ChangeSet::new();
    let before_preview = preview(&current.body);
    let after_preview = preview(&body);
    changes.track(
        "body",
        Some(before_preview.as_str()),
        Some(after_preview.as_str()),
    );
    let has_visible_change = !changes.is_empty();
    if has_visible_change {
        record(&transaction, id, ActivityAction::Updated, changes)?;
    }
    let updated = find_existing(&transaction, id)?;
    transaction.commit()?;
    Ok(updated)
}

pub fn delete(state: &AppState, id: &str) -> AppResult<()> {
    let mut connection = state.database();
    let transaction = connection.transaction()?;
    let current = find_existing(&transaction, id)?;
    let mut changes = ChangeSet::new();
    let body_preview = preview(&current.body);
    changes.track("body", Some(body_preview.as_str()), None);
    record(&transaction, id, ActivityAction::Deleted, changes)?;
    repository::delete(&transaction, id)?;
    transaction.commit()?;
    Ok(())
}

fn ensure_task_exists(connection: &Connection, task_id: &str) -> AppResult<()> {
    let task_exists = task_repository::find_by_id(connection, task_id)?.is_some();
    if !task_exists {
        return Err(AppError::NotFound("task".into()));
    }
    Ok(())
}

fn find_existing(connection: &Connection, id: &str) -> AppResult<Comment> {
    repository::find_by_id(connection, id)?.ok_or_else(|| AppError::NotFound("comment".into()))
}

fn record(
    connection: &Connection,
    comment_id: &str,
    action: ActivityAction,
    changes: ChangeSet,
) -> AppResult<()> {
    activity::record(connection, EntityType::Comment, comment_id, action, changes)
}

fn preview(text: &str) -> String {
    let is_short = text.chars().count() <= PREVIEW_LENGTH;
    if is_short {
        return text.to_string();
    }
    let head: String = text.chars().take(PREVIEW_LENGTH).collect();
    format!("{head}…")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{connection::open_in_memory, migrations};
    use crate::modules::activity::models::ActivityEntry;
    use crate::modules::tasks::models::{CreateTaskInput, Task};
    use crate::modules::tasks::service as tasks;
    use std::time::Duration;

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

    fn task(state: &AppState, title: &str) -> Task {
        tasks::create(
            state,
            CreateTaskInput {
                project_id: "p1".into(),
                title: title.into(),
                description: None,
                priority: None,
                due_date: None,
                column_id: None,
            },
        )
        .expect("creates task")
    }

    fn comment(state: &AppState, task_id: &str, body: &str) -> Comment {
        create(
            state,
            CreateCommentInput {
                task_id: task_id.into(),
                body: body.into(),
            },
        )
        .expect("creates comment")
    }

    fn bodies(state: &AppState, task_id: &str) -> Vec<String> {
        list(state, task_id)
            .expect("lists")
            .into_iter()
            .map(|comment| comment.body)
            .collect()
    }

    fn comment_entries(state: &AppState) -> Vec<ActivityEntry> {
        let mut all = activity::recent(state, Some(100)).expect("reads activity");
        all.reverse();
        all.into_iter()
            .filter(|entry| entry.entity_type == EntityType::Comment)
            .collect()
    }

    #[test]
    fn create_trims_the_body_and_stamps_matching_timestamps() {
        let state = state();
        let parent = task(&state, "T");

        let created = comment(&state, &parent.id, "  Looks good  ");

        assert_eq!(created.body, "Looks good");
        assert_eq!(created.task_id, parent.id);
        assert_eq!(created.created_at, created.updated_at);
    }

    #[test]
    fn create_validates_body_and_task() {
        let state = state();
        let parent = task(&state, "T");
        let input = |task_id: &str, body: &str| CreateCommentInput {
            task_id: task_id.into(),
            body: body.into(),
        };

        assert!(matches!(
            create(&state, input(&parent.id, "  ")),
            Err(AppError::Validation(_))
        ));
        assert!(matches!(
            create(
                &state,
                input(&parent.id, &"x".repeat(COMMENT_MAX_LENGTH + 1))
            ),
            Err(AppError::Validation(_))
        ));
        assert!(matches!(
            create(&state, input("ghost", "hi")),
            Err(AppError::NotFound(_))
        ));
        assert!(create(&state, input(&parent.id, &"x".repeat(COMMENT_MAX_LENGTH))).is_ok());
    }

    #[test]
    fn comments_are_listed_oldest_first_per_task() {
        let state = state();
        let one = task(&state, "One");
        let two = task(&state, "Two");
        comment(&state, &one.id, "first");
        std::thread::sleep(Duration::from_millis(3));
        comment(&state, &one.id, "second");
        comment(&state, &two.id, "elsewhere");

        assert_eq!(bodies(&state, &one.id), ["first", "second"]);
        assert_eq!(bodies(&state, &two.id), ["elsewhere"]);
        assert!(matches!(list(&state, "ghost"), Err(AppError::NotFound(_))));
    }

    #[test]
    fn archived_tasks_and_subtasks_keep_accepting_comments() {
        let state = state();
        let parent = task(&state, "T");
        let subtask = crate::modules::tasks::subtask_service::create(
            &state,
            crate::modules::tasks::models::CreateSubtaskInput {
                parent_task_id: parent.id.clone(),
                title: "Sub".into(),
            },
        )
        .expect("creates subtask");
        tasks::archive(&state, &parent.id).expect("archives");

        comment(&state, &parent.id, "post-mortem");
        comment(&state, &subtask.id, "note");

        assert_eq!(bodies(&state, &parent.id), ["post-mortem"]);
        assert_eq!(bodies(&state, &subtask.id), ["note"]);
    }

    #[test]
    fn update_changes_the_body_and_only_touches_updated_at() {
        let state = state();
        let parent = task(&state, "T");
        let original = comment(&state, &parent.id, "Draft");
        std::thread::sleep(Duration::from_millis(3));

        let edited = update(&state, &original.id, "  Final  ").expect("edits");

        assert_eq!(edited.body, "Final");
        assert_eq!(edited.created_at, original.created_at);
        assert!(edited.updated_at > original.updated_at);
        let logged = comment_entries(&state);
        let last = logged.last().expect("has entries");
        assert_eq!(last.action, ActivityAction::Updated);
        let changes = last.changes.as_ref().expect("has changes");
        assert_eq!(changes["body"].from.as_deref(), Some("Draft"));
        assert_eq!(changes["body"].to.as_deref(), Some("Final"));
    }

    #[test]
    fn update_with_the_same_text_is_a_no_op_without_a_log_entry() {
        let state = state();
        let parent = task(&state, "T");
        let original = comment(&state, &parent.id, "Same");

        let result = update(&state, &original.id, " Same ").expect("no-op");

        assert_eq!(result, original);
        assert_eq!(comment_entries(&state).len(), 1);
    }

    #[test]
    fn update_validates_body_and_existence() {
        let state = state();
        let parent = task(&state, "T");
        let original = comment(&state, &parent.id, "Keep");

        assert!(matches!(
            update(&state, &original.id, "  "),
            Err(AppError::Validation(_))
        ));
        assert!(matches!(
            update(&state, &original.id, &"x".repeat(COMMENT_MAX_LENGTH + 1)),
            Err(AppError::Validation(_))
        ));
        assert!(matches!(
            update(&state, "ghost", "x"),
            Err(AppError::NotFound(_))
        ));
        assert_eq!(bodies(&state, &parent.id), ["Keep"]);
    }

    #[test]
    fn long_bodies_are_previewed_in_the_history_not_stored_whole() {
        let state = state();
        let parent = task(&state, "T");
        let long = "y".repeat(PREVIEW_LENGTH + 50);

        comment(&state, &parent.id, &long);

        let logged = comment_entries(&state);
        let shown = logged[0].changes.as_ref().expect("has changes")["body"]
            .to
            .clone()
            .expect("has body");
        assert_eq!(shown.chars().count(), PREVIEW_LENGTH + 1);
        assert!(shown.ends_with('…'));
    }

    #[test]
    fn delete_removes_only_that_comment_and_logs_it() {
        let state = state();
        let parent = task(&state, "T");
        let gone = comment(&state, &parent.id, "Gone");
        comment(&state, &parent.id, "Stays");

        delete(&state, &gone.id).expect("deletes");

        assert_eq!(bodies(&state, &parent.id), ["Stays"]);
        let logged = comment_entries(&state);
        assert_eq!(
            logged.last().expect("has entries").action,
            ActivityAction::Deleted
        );
        assert!(matches!(
            delete(&state, &gone.id),
            Err(AppError::NotFound(_))
        ));
    }

    #[test]
    fn deleting_the_task_deletes_its_comments() {
        let state = state();
        let parent = task(&state, "T");
        let note = comment(&state, &parent.id, "bye");

        tasks::delete(&state, &parent.id).expect("deletes");

        let found = repository::find_by_id(&state.database(), &note.id).expect("reads");
        assert_eq!(found, None);
    }

    #[test]
    fn a_failing_activity_write_leaves_no_comment_behind() {
        let state = state();
        let parent = task(&state, "T");
        state
            .database()
            .execute_batch("DROP TABLE activity_log;")
            .expect("drops log table");

        let result = create(
            &state,
            CreateCommentInput {
                task_id: parent.id.clone(),
                body: "Ghost".into(),
            },
        );

        assert!(result.is_err());
        assert_eq!(
            repository::count_by_task(&state.database(), &parent.id).expect("counts"),
            0
        );
    }
}
