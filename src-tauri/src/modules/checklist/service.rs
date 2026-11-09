use rusqlite::Connection;

use super::models::{ChecklistItem, CreateChecklistItemInput, UpdateChecklistItemInput};
use super::repository::{self, ItemSlot};
use crate::error::{AppError, AppResult};
use crate::modules::activity::models::{ActivityAction, ChangeSet, EntityType};
use crate::modules::activity::service as activity;
use crate::modules::tasks::repository as task_repository;
use crate::shared::position::{self, Slot};
use crate::shared::text::require_text;
use crate::shared::{id, time};
use crate::state::AppState;

pub const ITEM_TEXT_MAX_LENGTH: usize = 500;
pub const MAX_ITEMS_PER_TASK: usize = 100;

pub fn create(state: &AppState, input: CreateChecklistItemInput) -> AppResult<ChecklistItem> {
    let text = require_text("checklist item", &input.text, ITEM_TEXT_MAX_LENGTH)?;

    let mut connection = state.database();
    let transaction = connection.transaction()?;
    let task = task_repository::find_by_id(&transaction, &input.task_id)?
        .ok_or_else(|| AppError::NotFound("task".into()))?;
    let task_is_archived = task.archived_at.is_some();
    if task_is_archived {
        return Err(AppError::Conflict(
            "archived tasks cannot receive checklist items; restore the task first".into(),
        ));
    }

    let siblings = repository::list_slots(&transaction, &task.id)?;
    let has_reached_limit = siblings.len() >= MAX_ITEMS_PER_TASK;
    if has_reached_limit {
        return Err(AppError::Validation(format!(
            "a checklist cannot have more than {MAX_ITEMS_PER_TASK} items"
        )));
    }
    let next_position = match siblings.last() {
        Some(last) => position::after(&last.position)?,
        None => position::first(),
    };

    let now = time::now();
    let item = ChecklistItem {
        id: id::new_id(),
        task_id: task.id,
        text,
        is_done: false,
        position: next_position,
        created_at: now.clone(),
        updated_at: now,
    };
    repository::insert(&transaction, &item)?;
    let mut changes = ChangeSet::new();
    changes.track("text", None, Some(item.text.as_str()));
    record(&transaction, &item.id, ActivityAction::Created, changes)?;
    transaction.commit()?;
    Ok(item)
}

pub fn list(state: &AppState, task_id: &str) -> AppResult<Vec<ChecklistItem>> {
    let connection = state.database();
    let task_exists = task_repository::find_by_id(&connection, task_id)?.is_some();
    if !task_exists {
        return Err(AppError::NotFound("task".into()));
    }
    repository::list_by_task(&connection, task_id)
}

pub fn update(
    state: &AppState,
    id: &str,
    input: UpdateChecklistItemInput,
) -> AppResult<ChecklistItem> {
    let mut connection = state.database();
    let transaction = connection.transaction()?;
    let current = find_existing(&transaction, id)?;

    let mut changed = current.clone();
    if let Some(text) = input.text {
        changed.text = require_text("checklist item", &text, ITEM_TEXT_MAX_LENGTH)?;
    }
    if let Some(is_done) = input.is_done {
        changed.is_done = is_done;
    }

    let text_changed = changed.text != current.text;
    let done_changed = changed.is_done != current.is_done;
    let has_changes = text_changed || done_changed;
    if !has_changes {
        return Ok(current);
    }

    changed.updated_at = time::now();
    repository::update_fields(&transaction, &changed)?;
    if text_changed {
        let mut changes = ChangeSet::new();
        changes.track(
            "text",
            Some(current.text.as_str()),
            Some(changed.text.as_str()),
        );
        record(&transaction, id, ActivityAction::Updated, changes)?;
    }
    if done_changed {
        let action = if changed.is_done {
            ActivityAction::Completed
        } else {
            ActivityAction::Reopened
        };
        record(&transaction, id, action, ChangeSet::new())?;
    }
    transaction.commit()?;
    Ok(changed)
}

pub fn move_item(
    state: &AppState,
    id: &str,
    after_item_id: Option<String>,
) -> AppResult<ChecklistItem> {
    let mut connection = state.database();
    let transaction = connection.transaction()?;
    let current = find_existing(&transaction, id)?;

    let slots = repository::list_slots(&transaction, &current.task_id)?;
    let ordered = to_slots(&slots);
    let is_already_there = position::previous_sibling_id(&ordered, id) == after_item_id.as_deref();
    if is_already_there {
        return Ok(current);
    }

    let siblings: Vec<Slot<'_>> = ordered
        .iter()
        .filter(|slot| slot.id != id)
        .copied()
        .collect();
    let new_position = position::place_after(&siblings, after_item_id.as_deref())?;
    repository::set_position(&transaction, id, &new_position, &time::now())?;
    let moved = find_existing(&transaction, id)?;
    transaction.commit()?;
    Ok(moved)
}

pub fn delete(state: &AppState, id: &str) -> AppResult<()> {
    let mut connection = state.database();
    let transaction = connection.transaction()?;
    let current = find_existing(&transaction, id)?;
    repository::delete(&transaction, id)?;
    let mut changes = ChangeSet::new();
    changes.track("text", Some(current.text.as_str()), None);
    record(&transaction, id, ActivityAction::Deleted, changes)?;
    transaction.commit()?;
    Ok(())
}

fn find_existing(connection: &Connection, id: &str) -> AppResult<ChecklistItem> {
    repository::find_by_id(connection, id)?
        .ok_or_else(|| AppError::NotFound("checklist item".into()))
}

fn record(
    connection: &Connection,
    item_id: &str,
    action: ActivityAction,
    changes: ChangeSet,
) -> AppResult<()> {
    activity::record(
        connection,
        EntityType::ChecklistItem,
        item_id,
        action,
        changes,
    )
}

fn to_slots(slots: &[ItemSlot]) -> Vec<Slot<'_>> {
    slots
        .iter()
        .map(|slot| Slot {
            id: slot.id.as_str(),
            position: slot.position.as_str(),
        })
        .collect()
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

    fn add(state: &AppState, task_id: &str, text: &str) -> ChecklistItem {
        create(
            state,
            CreateChecklistItemInput {
                task_id: task_id.into(),
                text: text.into(),
            },
        )
        .expect("adds item")
    }

    fn texts(state: &AppState, task_id: &str) -> Vec<String> {
        list(state, task_id)
            .expect("lists")
            .into_iter()
            .map(|item| item.text)
            .collect()
    }

    fn item_entries(state: &AppState) -> Vec<ActivityEntry> {
        let mut all = activity::recent(state, Some(100)).expect("reads activity");
        all.reverse();
        all.into_iter()
            .filter(|entry| entry.entity_type == EntityType::ChecklistItem)
            .collect()
    }

    fn actions(state: &AppState) -> Vec<ActivityAction> {
        item_entries(state)
            .iter()
            .map(|entry| entry.action)
            .collect()
    }

    #[test]
    fn create_appends_a_trimmed_open_item() {
        let state = state();
        let parent = task(&state, "T");

        let first = add(&state, &parent.id, "  First  ");
        add(&state, &parent.id, "Second");

        assert_eq!(first.text, "First");
        assert!(!first.is_done);
        assert_eq!(first.task_id, parent.id);
        assert_eq!(texts(&state, &parent.id), ["First", "Second"]);
    }

    #[test]
    fn create_validates_text_task_and_limit() {
        let state = state();
        let parent = task(&state, "T");
        let input = |task_id: &str, text: &str| CreateChecklistItemInput {
            task_id: task_id.into(),
            text: text.into(),
        };

        assert!(matches!(
            create(&state, input(&parent.id, "  ")),
            Err(AppError::Validation(_))
        ));
        assert!(matches!(
            create(
                &state,
                input(&parent.id, &"x".repeat(ITEM_TEXT_MAX_LENGTH + 1))
            ),
            Err(AppError::Validation(_))
        ));
        assert!(matches!(
            create(&state, input("ghost", "x")),
            Err(AppError::NotFound(_))
        ));
        for index in 0..MAX_ITEMS_PER_TASK {
            add(&state, &parent.id, &format!("I{index}"));
        }
        assert!(matches!(
            create(&state, input(&parent.id, "one too many")),
            Err(AppError::Validation(_))
        ));
    }

    #[test]
    fn an_archived_task_does_not_accept_new_items_but_keeps_its_old_ones() {
        let state = state();
        let parent = task(&state, "T");
        let kept = add(&state, &parent.id, "Kept");
        tasks::archive(&state, &parent.id).expect("archives");

        let rejected = create(
            &state,
            CreateChecklistItemInput {
                task_id: parent.id.clone(),
                text: "New".into(),
            },
        );
        let toggled = update(
            &state,
            &kept.id,
            UpdateChecklistItemInput {
                is_done: Some(true),
                ..Default::default()
            },
        );

        assert!(matches!(rejected, Err(AppError::Conflict(_))));
        assert!(toggled.is_ok());
    }

    #[test]
    fn checklists_work_on_subtasks_too() {
        let state = state();
        let parent = task(&state, "Parent");
        let subtask = crate::modules::tasks::subtask_service::create(
            &state,
            crate::modules::tasks::models::CreateSubtaskInput {
                parent_task_id: parent.id,
                title: "Sub".into(),
            },
        )
        .expect("creates subtask");

        add(&state, &subtask.id, "Step");

        assert_eq!(texts(&state, &subtask.id), ["Step"]);
    }

    #[test]
    fn list_is_scoped_per_task_and_rejects_unknown_tasks() {
        let state = state();
        let one = task(&state, "One");
        let two = task(&state, "Two");
        add(&state, &one.id, "A");
        add(&state, &two.id, "B");

        assert_eq!(texts(&state, &one.id), ["A"]);
        assert!(matches!(list(&state, "ghost"), Err(AppError::NotFound(_))));
    }

    #[test]
    fn toggle_sets_and_clears_the_done_flag() {
        let state = state();
        let parent = task(&state, "T");
        let item = add(&state, &parent.id, "A");
        std::thread::sleep(Duration::from_millis(3));

        let done = update(
            &state,
            &item.id,
            UpdateChecklistItemInput {
                is_done: Some(true),
                ..Default::default()
            },
        )
        .expect("completes");
        let reopened = update(
            &state,
            &item.id,
            UpdateChecklistItemInput {
                is_done: Some(false),
                ..Default::default()
            },
        )
        .expect("reopens");

        assert!(done.is_done);
        assert!(done.updated_at > item.updated_at);
        assert!(!reopened.is_done);
        assert_eq!(
            actions(&state),
            [
                ActivityAction::Created,
                ActivityAction::Completed,
                ActivityAction::Reopened
            ]
        );
    }

    #[test]
    fn rename_trims_validates_and_logs_the_text_change() {
        let state = state();
        let parent = task(&state, "T");
        let item = add(&state, &parent.id, "Old");

        let renamed = update(
            &state,
            &item.id,
            UpdateChecklistItemInput {
                text: Some("  New  ".into()),
                ..Default::default()
            },
        )
        .expect("renames");
        let blank = update(
            &state,
            &item.id,
            UpdateChecklistItemInput {
                text: Some("  ".into()),
                ..Default::default()
            },
        );

        assert_eq!(renamed.text, "New");
        assert!(matches!(blank, Err(AppError::Validation(_))));
        let logged = item_entries(&state);
        let changes = logged
            .last()
            .and_then(|entry| entry.changes.as_ref())
            .expect("has changes");
        assert_eq!(changes["text"].from.as_deref(), Some("Old"));
        assert_eq!(changes["text"].to.as_deref(), Some("New"));
    }

    #[test]
    fn changing_text_and_state_together_logs_both() {
        let state = state();
        let parent = task(&state, "T");
        let item = add(&state, &parent.id, "A");

        update(
            &state,
            &item.id,
            UpdateChecklistItemInput {
                text: Some("B".into()),
                is_done: Some(true),
            },
        )
        .expect("updates");

        assert_eq!(
            actions(&state),
            [
                ActivityAction::Created,
                ActivityAction::Updated,
                ActivityAction::Completed
            ]
        );
    }

    #[test]
    fn an_update_that_changes_nothing_writes_nothing() {
        let state = state();
        let parent = task(&state, "T");
        let item = add(&state, &parent.id, "A");

        let empty = update(&state, &item.id, UpdateChecklistItemInput::default()).expect("no-op");
        let same = update(
            &state,
            &item.id,
            UpdateChecklistItemInput {
                text: Some(" A ".into()),
                is_done: Some(false),
            },
        )
        .expect("no-op");

        assert_eq!(empty, item);
        assert_eq!(same, item);
        assert_eq!(actions(&state), [ActivityAction::Created]);
    }

    #[test]
    fn update_and_delete_of_unknown_items_are_not_found() {
        let state = state();

        assert!(matches!(
            update(&state, "ghost", UpdateChecklistItemInput::default()),
            Err(AppError::NotFound(_))
        ));
        assert!(matches!(
            delete(&state, "ghost"),
            Err(AppError::NotFound(_))
        ));
        assert!(matches!(
            move_item(&state, "ghost", None),
            Err(AppError::NotFound(_))
        ));
    }

    #[test]
    fn delete_removes_only_that_item_and_logs_its_text() {
        let state = state();
        let parent = task(&state, "T");
        let gone = add(&state, &parent.id, "Gone");
        add(&state, &parent.id, "Stays");

        delete(&state, &gone.id).expect("deletes");

        assert_eq!(texts(&state, &parent.id), ["Stays"]);
        let logged = item_entries(&state);
        let last = logged.last().expect("has entries");
        assert_eq!(last.action, ActivityAction::Deleted);
        assert_eq!(
            last.changes.as_ref().expect("has changes")["text"]
                .from
                .as_deref(),
            Some("Gone")
        );
    }

    #[test]
    fn reordering_moves_an_item_to_the_first_middle_and_last_places() {
        let state = state();
        let parent = task(&state, "T");
        let a = add(&state, &parent.id, "A");
        let b = add(&state, &parent.id, "B");
        let c = add(&state, &parent.id, "C");

        move_item(&state, &c.id, None).expect("C first");
        assert_eq!(texts(&state, &parent.id), ["C", "A", "B"]);
        move_item(&state, &c.id, Some(a.id.clone())).expect("C after A");
        assert_eq!(texts(&state, &parent.id), ["A", "C", "B"]);
        move_item(&state, &a.id, Some(b.id.clone())).expect("A last");
        assert_eq!(texts(&state, &parent.id), ["C", "B", "A"]);
    }

    #[test]
    fn reordering_is_not_logged_and_is_a_no_op_in_place() {
        let state = state();
        let parent = task(&state, "T");
        let a = add(&state, &parent.id, "A");
        let b = add(&state, &parent.id, "B");

        let first = move_item(&state, &a.id, None).expect("no-op");
        let second = move_item(&state, &b.id, Some(a.id.clone())).expect("no-op");
        move_item(&state, &b.id, None).expect("moves");

        assert_eq!((first, second), (a, b));
        assert_eq!(actions(&state).len(), 2);
    }

    #[test]
    fn reordering_rejects_anchors_from_another_task_and_self() {
        let state = state();
        let one = task(&state, "One");
        let two = task(&state, "Two");
        let mine = add(&state, &one.id, "Mine");
        let theirs = add(&state, &two.id, "Theirs");

        let foreign = move_item(&state, &mine.id, Some(theirs.id));
        let itself = move_item(&state, &mine.id, Some(mine.id.clone()));

        assert!(matches!(foreign, Err(AppError::InvalidMove)));
        assert!(matches!(itself, Err(AppError::InvalidMove)));
    }

    #[test]
    fn deleting_the_task_deletes_its_checklist() {
        let state = state();
        let parent = task(&state, "T");
        let item = add(&state, &parent.id, "A");

        tasks::delete(&state, &parent.id).expect("deletes");

        let found = repository::find_by_id(&state.database(), &item.id).expect("reads");
        assert_eq!(found, None);
    }

    #[test]
    fn a_failing_activity_write_leaves_no_item_behind() {
        let state = state();
        let parent = task(&state, "T");
        state
            .database()
            .execute_batch("DROP TABLE activity_log;")
            .expect("drops log table");

        let result = create(
            &state,
            CreateChecklistItemInput {
                task_id: parent.id.clone(),
                text: "Ghost".into(),
            },
        );

        assert!(result.is_err());
        assert!(
            repository::list_by_task(&state.database(), &parent.id)
                .expect("reads")
                .is_empty()
        );
    }
}
