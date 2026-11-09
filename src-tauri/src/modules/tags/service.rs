use rusqlite::Connection;

use super::models::{CreateTagInput, Tag, UpdateTagInput};
use super::repository;
use crate::error::{AppError, AppResult};
use crate::modules::activity::models::{ActivityAction, ChangeSet, EntityType};
use crate::modules::activity::service as activity;
use crate::modules::tasks::repository as task_repository;
use crate::shared::text::{optional_text, require_text};
use crate::shared::{id, time};
use crate::state::AppState;

pub const TAG_NAME_MAX_LENGTH: usize = 40;

pub fn create(state: &AppState, input: CreateTagInput) -> AppResult<Tag> {
    let name = require_text("tag name", &input.name, TAG_NAME_MAX_LENGTH)?;

    let mut connection = state.database();
    let transaction = connection.transaction()?;
    ensure_name_is_free(&transaction, &name, None)?;

    let now = time::now();
    let tag = Tag {
        id: id::new_id(),
        name,
        color: optional_text(input.color),
        created_at: now.clone(),
        updated_at: now,
        task_count: 0,
    };
    repository::insert(&transaction, &tag)?;
    let mut changes = ChangeSet::new();
    changes.track("name", None, Some(tag.name.as_str()));
    record(&transaction, &tag.id, ActivityAction::Created, changes)?;
    transaction.commit()?;
    Ok(tag)
}

pub fn list(state: &AppState) -> AppResult<Vec<Tag>> {
    let connection = state.database();
    repository::list_all(&connection)
}

pub fn list_for_task(state: &AppState, task_id: &str) -> AppResult<Vec<Tag>> {
    let connection = state.database();
    ensure_task_exists(&connection, task_id)?;
    repository::list_by_task(&connection, task_id)
}

pub fn update(state: &AppState, id: &str, input: UpdateTagInput) -> AppResult<Tag> {
    let mut connection = state.database();
    let transaction = connection.transaction()?;
    let current = find_existing(&transaction, id)?;

    let mut changed = current.clone();
    if let Some(name) = input.name {
        changed.name = require_text("tag name", &name, TAG_NAME_MAX_LENGTH)?;
        ensure_name_is_free(&transaction, &changed.name, Some(id))?;
    }
    if let Some(color) = input.color {
        changed.color = optional_text(color);
    }

    let mut changes = ChangeSet::new();
    changes.track(
        "name",
        Some(current.name.as_str()),
        Some(changed.name.as_str()),
    );
    changes.track("color", current.color.as_deref(), changed.color.as_deref());
    let has_changes = !changes.is_empty();
    if !has_changes {
        return Ok(current);
    }

    changed.updated_at = time::now();
    repository::update(&transaction, &changed)?;
    record(&transaction, id, ActivityAction::Updated, changes)?;
    transaction.commit()?;
    Ok(changed)
}

pub fn delete(state: &AppState, id: &str) -> AppResult<()> {
    let mut connection = state.database();
    let transaction = connection.transaction()?;
    let current = find_existing(&transaction, id)?;
    repository::delete(&transaction, id)?;
    let mut changes = ChangeSet::new();
    changes.track("name", Some(current.name.as_str()), None);
    record(&transaction, id, ActivityAction::Deleted, changes)?;
    transaction.commit()?;
    Ok(())
}

pub fn assign(state: &AppState, task_id: &str, tag_id: &str) -> AppResult<()> {
    let mut connection = state.database();
    let transaction = connection.transaction()?;
    ensure_task_exists(&transaction, task_id)?;
    let tag = find_existing(&transaction, tag_id)?;

    let newly_assigned = repository::assign(&transaction, task_id, tag_id)? > 0;
    if newly_assigned {
        let mut changes = ChangeSet::new();
        changes.track("tag", None, Some(tag.name.as_str()));
        record_on_task(&transaction, task_id, changes)?;
    }
    transaction.commit()?;
    Ok(())
}

pub fn unassign(state: &AppState, task_id: &str, tag_id: &str) -> AppResult<()> {
    let mut connection = state.database();
    let transaction = connection.transaction()?;
    ensure_task_exists(&transaction, task_id)?;
    let tag = find_existing(&transaction, tag_id)?;

    let was_assigned = repository::unassign(&transaction, task_id, tag_id)? > 0;
    if was_assigned {
        let mut changes = ChangeSet::new();
        changes.track("tag", Some(tag.name.as_str()), None);
        record_on_task(&transaction, task_id, changes)?;
    }
    transaction.commit()?;
    Ok(())
}

fn ensure_name_is_free(connection: &Connection, name: &str, own_id: Option<&str>) -> AppResult<()> {
    let existing = repository::find_id_by_name(connection, name)?;
    let is_taken = existing.is_some_and(|found| Some(found.as_str()) != own_id);
    if is_taken {
        return Err(AppError::Conflict(format!(
            "a tag named '{name}' already exists"
        )));
    }
    Ok(())
}

fn ensure_task_exists(connection: &Connection, task_id: &str) -> AppResult<()> {
    let task_exists = task_repository::find_by_id(connection, task_id)?.is_some();
    if !task_exists {
        return Err(AppError::NotFound("task".into()));
    }
    Ok(())
}

fn find_existing(connection: &Connection, id: &str) -> AppResult<Tag> {
    repository::find_by_id(connection, id)?.ok_or_else(|| AppError::NotFound("tag".into()))
}

fn record(
    connection: &Connection,
    tag_id: &str,
    action: ActivityAction,
    changes: ChangeSet,
) -> AppResult<()> {
    activity::record(connection, EntityType::Tag, tag_id, action, changes)
}

fn record_on_task(connection: &Connection, task_id: &str, changes: ChangeSet) -> AppResult<()> {
    activity::record(
        connection,
        EntityType::Task,
        task_id,
        ActivityAction::Updated,
        changes,
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{connection::open_in_memory, migrations};
    use crate::modules::activity::models::ActivityEntry;
    use crate::modules::tasks::models::{CreateTaskInput, Task};
    use crate::modules::tasks::service as tasks;

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

    fn tag(state: &AppState, name: &str) -> Tag {
        create(
            state,
            CreateTagInput {
                name: name.into(),
                color: None,
            },
        )
        .expect("creates tag")
    }

    fn names(tags: Vec<Tag>) -> Vec<String> {
        tags.into_iter().map(|tag| tag.name).collect()
    }

    fn entries(state: &AppState, entity_type: EntityType) -> Vec<ActivityEntry> {
        let mut all = activity::recent(state, Some(100)).expect("reads activity");
        all.reverse();
        all.into_iter()
            .filter(|entry| entry.entity_type == entity_type)
            .collect()
    }

    #[test]
    fn create_trims_name_and_blank_color_becomes_none() {
        let state = state();

        let created = create(
            &state,
            CreateTagInput {
                name: "  bug  ".into(),
                color: Some("  ".into()),
            },
        )
        .expect("creates");

        assert_eq!(created.name, "bug");
        assert_eq!(created.color, None);
        assert_eq!(created.task_count, 0);
    }

    #[test]
    fn create_rejects_blank_long_and_duplicate_names_ignoring_case() {
        let state = state();
        tag(&state, "Bug");
        let attempt = |name: &str| {
            create(
                &state,
                CreateTagInput {
                    name: name.into(),
                    color: None,
                },
            )
        };

        assert!(matches!(attempt("  "), Err(AppError::Validation(_))));
        assert!(matches!(
            attempt(&"x".repeat(TAG_NAME_MAX_LENGTH + 1)),
            Err(AppError::Validation(_))
        ));
        assert!(matches!(attempt("bug"), Err(AppError::Conflict(_))));
        assert!(matches!(attempt(" BUG "), Err(AppError::Conflict(_))));
        assert_eq!(names(list(&state).expect("lists")), ["Bug"]);
    }

    #[test]
    fn list_is_alphabetical_ignoring_case_with_usage_counts() {
        let state = state();
        let beta = tag(&state, "beta");
        tag(&state, "Alpha");
        let one = task(&state, "One");
        let two = task(&state, "Two");
        assign(&state, &one.id, &beta.id).expect("assigns");
        assign(&state, &two.id, &beta.id).expect("assigns");

        let listed = list(&state).expect("lists");

        let summary: Vec<(&str, u32)> = listed
            .iter()
            .map(|tag| (tag.name.as_str(), tag.task_count))
            .collect();
        assert_eq!(summary, [("Alpha", 0), ("beta", 2)]);
    }

    #[test]
    fn rename_and_recolor_are_validated_and_logged() {
        let state = state();
        let created = tag(&state, "bug");
        tag(&state, "feature");

        let renamed = update(
            &state,
            &created.id,
            UpdateTagInput {
                name: Some(" defect ".into()),
                color: Some(Some("#ff0000".into())),
            },
        )
        .expect("updates");
        let cleared = update(
            &state,
            &created.id,
            UpdateTagInput {
                color: Some(None),
                ..Default::default()
            },
        )
        .expect("clears color");
        let clash = update(
            &state,
            &created.id,
            UpdateTagInput {
                name: Some("FEATURE".into()),
                ..Default::default()
            },
        );
        let blank = update(
            &state,
            &created.id,
            UpdateTagInput {
                name: Some("  ".into()),
                ..Default::default()
            },
        );

        assert_eq!(renamed.name, "defect");
        assert_eq!(renamed.color.as_deref(), Some("#ff0000"));
        assert_eq!(cleared.color, None);
        assert!(matches!(clash, Err(AppError::Conflict(_))));
        assert!(matches!(blank, Err(AppError::Validation(_))));
        let logged = entries(&state, EntityType::Tag);
        let actions: Vec<ActivityAction> = logged.iter().map(|entry| entry.action).collect();
        assert_eq!(
            actions,
            [
                ActivityAction::Created,
                ActivityAction::Created,
                ActivityAction::Updated,
                ActivityAction::Updated
            ]
        );
    }

    #[test]
    fn a_tag_can_change_only_the_case_of_its_own_name() {
        let state = state();
        let created = tag(&state, "bug");

        let renamed = update(
            &state,
            &created.id,
            UpdateTagInput {
                name: Some("Bug".into()),
                ..Default::default()
            },
        )
        .expect("renames");

        assert_eq!(renamed.name, "Bug");
    }

    #[test]
    fn an_update_that_changes_nothing_writes_nothing() {
        let state = state();
        let created = tag(&state, "bug");

        let same = update(
            &state,
            &created.id,
            UpdateTagInput {
                name: Some(" bug ".into()),
                ..Default::default()
            },
        )
        .expect("no-op");

        assert_eq!(same, created);
        assert_eq!(entries(&state, EntityType::Tag).len(), 1);
    }

    #[test]
    fn update_and_delete_of_unknown_tags_are_not_found() {
        let state = state();

        assert!(matches!(
            update(&state, "ghost", UpdateTagInput::default()),
            Err(AppError::NotFound(_))
        ));
        assert!(matches!(
            delete(&state, "ghost"),
            Err(AppError::NotFound(_))
        ));
    }

    #[test]
    fn deleting_a_tag_unassigns_it_everywhere_but_keeps_the_tasks() {
        let state = state();
        let doomed = tag(&state, "doomed");
        let keeper = tag(&state, "keeper");
        let parent = task(&state, "T");
        assign(&state, &parent.id, &doomed.id).expect("assigns");
        assign(&state, &parent.id, &keeper.id).expect("assigns");

        delete(&state, &doomed.id).expect("deletes");

        assert_eq!(
            names(list_for_task(&state, &parent.id).expect("lists")),
            ["keeper"]
        );
        assert!(tasks::get(&state, &parent.id).is_ok());
        let last = entries(&state, EntityType::Tag)
            .into_iter()
            .last()
            .expect("has entries");
        assert_eq!(last.action, ActivityAction::Deleted);
    }

    #[test]
    fn assign_and_unassign_manage_the_task_tags_and_log_on_the_task() {
        let state = state();
        let bug = tag(&state, "bug");
        let ui = tag(&state, "ui");
        let parent = task(&state, "T");

        assign(&state, &parent.id, &ui.id).expect("assigns");
        assign(&state, &parent.id, &bug.id).expect("assigns");
        unassign(&state, &parent.id, &ui.id).expect("unassigns");

        assert_eq!(
            names(list_for_task(&state, &parent.id).expect("lists")),
            ["bug"]
        );
        let task_log: Vec<ActivityEntry> = entries(&state, EntityType::Task)
            .into_iter()
            .filter(|entry| entry.action == ActivityAction::Updated)
            .collect();
        let shown: Vec<(Option<String>, Option<String>)> = task_log
            .iter()
            .map(|entry| {
                let change = &entry.changes.as_ref().expect("has changes")["tag"];
                (change.from.clone(), change.to.clone())
            })
            .collect();
        assert_eq!(
            shown,
            [
                (None, Some("ui".to_string())),
                (None, Some("bug".to_string())),
                (Some("ui".to_string()), None)
            ]
        );
    }

    #[test]
    fn assigning_twice_or_unassigning_a_missing_link_changes_and_logs_nothing() {
        let state = state();
        let bug = tag(&state, "bug");
        let parent = task(&state, "T");
        assign(&state, &parent.id, &bug.id).expect("assigns");
        let before = entries(&state, EntityType::Task).len();

        assign(&state, &parent.id, &bug.id).expect("no-op");
        unassign(&state, &parent.id, &bug.id).expect("removes");
        unassign(&state, &parent.id, &bug.id).expect("no-op");

        assert_eq!(entries(&state, EntityType::Task).len(), before + 1);
        assert!(list_for_task(&state, &parent.id).expect("lists").is_empty());
    }

    #[test]
    fn assignment_requires_an_existing_task_and_tag() {
        let state = state();
        let bug = tag(&state, "bug");
        let parent = task(&state, "T");

        assert!(matches!(
            assign(&state, "ghost", &bug.id),
            Err(AppError::NotFound(_))
        ));
        assert!(matches!(
            assign(&state, &parent.id, "ghost"),
            Err(AppError::NotFound(_))
        ));
        assert!(matches!(
            unassign(&state, "ghost", &bug.id),
            Err(AppError::NotFound(_))
        ));
        assert!(matches!(
            list_for_task(&state, "ghost"),
            Err(AppError::NotFound(_))
        ));
    }

    #[test]
    fn deleting_a_task_removes_its_assignments_and_keeps_the_tag() {
        let state = state();
        let bug = tag(&state, "bug");
        let parent = task(&state, "T");
        assign(&state, &parent.id, &bug.id).expect("assigns");

        tasks::delete(&state, &parent.id).expect("deletes");

        let remaining = list(&state).expect("lists");
        assert_eq!(remaining.len(), 1);
        assert_eq!(remaining[0].task_count, 0);
    }

    #[test]
    fn tags_are_shared_across_projects() {
        let state = state();
        state
            .database()
            .execute(
                "INSERT INTO projects (id, name, created_at, updated_at) VALUES ('p2', 'Q', ?1, ?1)",
                [NOW],
            )
            .expect("second project");
        let other = tasks::create(
            &state,
            CreateTaskInput {
                project_id: "p2".into(),
                title: "Other".into(),
                description: None,
                priority: None,
                due_date: None,
                column_id: None,
            },
        )
        .expect("creates");
        let bug = tag(&state, "bug");
        let mine = task(&state, "Mine");

        assign(&state, &mine.id, &bug.id).expect("assigns");
        assign(&state, &other.id, &bug.id).expect("assigns");

        assert_eq!(list(&state).expect("lists")[0].task_count, 2);
    }

    #[test]
    fn a_failing_activity_write_leaves_no_tag_behind() {
        let state = state();
        state
            .database()
            .execute_batch("DROP TABLE activity_log;")
            .expect("drops log table");

        let result = create(
            &state,
            CreateTagInput {
                name: "ghost".into(),
                color: None,
            },
        );

        assert!(result.is_err());
        assert!(
            repository::list_all(&state.database())
                .expect("reads")
                .is_empty()
        );
    }
}
