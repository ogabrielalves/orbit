use super::models::{CreateSubtaskInput, Task, TaskPriority};
use super::repository::{self, TaskSlot};
use super::service::{TITLE_MAX_LENGTH, end_position, find_existing, record};
use crate::error::{AppError, AppResult};
use crate::modules::activity::models::{ActivityAction, ChangeSet};
use crate::shared::position::{self, Slot};
use crate::shared::text::require_text;
use crate::shared::{id, time};
use crate::state::AppState;

pub const MAX_SUBTASKS_PER_TASK: usize = 100;

pub fn create(state: &AppState, input: CreateSubtaskInput) -> AppResult<Task> {
    let title = require_text("subtask title", &input.title, TITLE_MAX_LENGTH)?;

    let mut connection = state.database();
    let transaction = connection.transaction()?;
    let parent = find_existing(&transaction, &input.parent_task_id)?;
    let parent_is_a_subtask = parent.parent_task_id.is_some();
    if parent_is_a_subtask {
        return Err(AppError::Validation(
            "a subtask cannot have subtasks of its own".into(),
        ));
    }
    let parent_is_archived = parent.archived_at.is_some();
    if parent_is_archived {
        return Err(AppError::Conflict(
            "archived tasks cannot receive subtasks; restore the task first".into(),
        ));
    }

    let siblings = repository::list_subtask_slots(&transaction, &parent.id)?;
    let has_reached_limit = siblings.len() >= MAX_SUBTASKS_PER_TASK;
    if has_reached_limit {
        return Err(AppError::Validation(format!(
            "a task cannot have more than {MAX_SUBTASKS_PER_TASK} subtasks"
        )));
    }

    let now = time::now();
    let subtask = Task {
        id: id::new_id(),
        project_id: parent.project_id,
        board_id: None,
        column_id: None,
        parent_task_id: Some(parent.id),
        title,
        description: String::new(),
        priority: TaskPriority::Medium,
        due_date: None,
        position: end_position(&siblings)?,
        created_at: now.clone(),
        updated_at: now,
        completed_at: None,
        archived_at: None,
    };
    repository::insert(&transaction, &subtask)?;
    let mut changes = ChangeSet::new();
    changes.track("title", None, Some(subtask.title.as_str()));
    record(&transaction, &subtask.id, ActivityAction::Created, changes)?;
    transaction.commit()?;
    Ok(subtask)
}

pub fn list(state: &AppState, parent_task_id: &str) -> AppResult<Vec<Task>> {
    let connection = state.database();
    find_existing(&connection, parent_task_id)?;
    repository::list_subtasks(&connection, parent_task_id)
}

pub fn set_done(state: &AppState, id: &str, is_done: bool) -> AppResult<Task> {
    let mut connection = state.database();
    let transaction = connection.transaction()?;
    let current = find_subtask(&transaction, id)?;

    let is_already_in_that_state = current.completed_at.is_some() == is_done;
    if is_already_in_that_state {
        return Ok(current);
    }

    let now = time::now();
    let completed_at = is_done.then_some(now.as_str());
    repository::set_completed_at(&transaction, id, completed_at, &now)?;
    let action = if is_done {
        ActivityAction::Completed
    } else {
        ActivityAction::Reopened
    };
    record(&transaction, id, action, ChangeSet::new())?;
    let updated = find_existing(&transaction, id)?;
    transaction.commit()?;
    Ok(updated)
}

pub fn move_subtask(
    state: &AppState,
    id: &str,
    after_subtask_id: Option<String>,
) -> AppResult<Task> {
    let mut connection = state.database();
    let transaction = connection.transaction()?;
    let current = find_subtask(&transaction, id)?;
    let parent_id = parent_of(&current)?;

    let slots = repository::list_subtask_slots(&transaction, parent_id)?;
    let ordered = to_slots(&slots);
    let is_already_there =
        position::previous_sibling_id(&ordered, id) == after_subtask_id.as_deref();
    if is_already_there {
        return Ok(current);
    }

    let siblings: Vec<Slot<'_>> = ordered
        .iter()
        .filter(|slot| slot.id != id)
        .copied()
        .collect();
    let new_position = position::place_after(&siblings, after_subtask_id.as_deref())?;
    repository::set_position(&transaction, id, &new_position, &time::now())?;
    let moved = find_existing(&transaction, id)?;
    transaction.commit()?;
    Ok(moved)
}

fn find_subtask(connection: &rusqlite::Connection, id: &str) -> AppResult<Task> {
    let task = find_existing(connection, id)?;
    let is_top_level = task.parent_task_id.is_none();
    if is_top_level {
        return Err(AppError::Validation("task is not a subtask".into()));
    }
    Ok(task)
}

fn parent_of(subtask: &Task) -> AppResult<&str> {
    subtask.parent_task_id.as_deref().ok_or_else(|| {
        log::error!("subtask {} lost its parent reference", subtask.id);
        AppError::Internal
    })
}

pub(super) fn to_slots(slots: &[TaskSlot]) -> Vec<Slot<'_>> {
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
    use crate::modules::activity::models::{ActivityEntry, EntityType};
    use crate::modules::activity::service as activity;
    use crate::modules::tasks::models::CreateTaskInput;
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

    fn parent(state: &AppState, title: &str) -> Task {
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
        .expect("creates parent")
    }

    fn subtask(state: &AppState, parent_id: &str, title: &str) -> Task {
        create(
            state,
            CreateSubtaskInput {
                parent_task_id: parent_id.into(),
                title: title.into(),
            },
        )
        .expect("creates subtask")
    }

    fn titles(state: &AppState, parent_id: &str) -> Vec<String> {
        list(state, parent_id)
            .expect("lists")
            .into_iter()
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
    fn a_task_without_a_parent_reference_is_an_internal_error_when_asked_for_its_parent() {
        let state = state();
        let top_level = parent(&state, "Top level");
        let child = subtask(&state, &top_level.id, "Child");

        assert_eq!(parent_of(&child).expect("has a parent"), top_level.id);
        assert!(matches!(parent_of(&top_level), Err(AppError::Internal)));
    }

    #[test]
    fn create_inherits_the_project_and_stays_off_every_board() {
        let state = state();
        let task = parent(&state, "Parent");

        let created = subtask(&state, &task.id, "  Step  ");

        assert_eq!(created.title, "Step");
        assert_eq!(created.project_id, "p1");
        assert_eq!(created.parent_task_id.as_deref(), Some(task.id.as_str()));
        assert_eq!((created.board_id, created.column_id), (None, None));
        assert_eq!(created.completed_at, None);
    }

    #[test]
    fn subtasks_are_appended_in_creation_order() {
        let state = state();
        let task = parent(&state, "Parent");

        subtask(&state, &task.id, "A");
        subtask(&state, &task.id, "B");
        subtask(&state, &task.id, "C");

        assert_eq!(titles(&state, &task.id), ["A", "B", "C"]);
    }

    #[test]
    fn subtasks_never_show_up_in_the_backlog_or_board_listings() {
        let state = state();
        let task = parent(&state, "Parent");
        subtask(&state, &task.id, "Hidden");

        let slots = repository::list_backlog_slots(&state.database(), "p1").expect("reads");

        assert_eq!(slots.len(), 1);
    }

    #[test]
    fn create_validates_title_parent_and_depth() {
        let state = state();
        let task = parent(&state, "Parent");
        let child = subtask(&state, &task.id, "Child");

        let blank = create(
            &state,
            CreateSubtaskInput {
                parent_task_id: task.id.clone(),
                title: "  ".into(),
            },
        );
        let long = create(
            &state,
            CreateSubtaskInput {
                parent_task_id: task.id.clone(),
                title: "x".repeat(TITLE_MAX_LENGTH + 1),
            },
        );
        let missing = create(
            &state,
            CreateSubtaskInput {
                parent_task_id: "ghost".into(),
                title: "x".into(),
            },
        );
        let nested = create(
            &state,
            CreateSubtaskInput {
                parent_task_id: child.id,
                title: "x".into(),
            },
        );

        assert!(matches!(blank, Err(AppError::Validation(_))));
        assert!(matches!(long, Err(AppError::Validation(_))));
        assert!(matches!(missing, Err(AppError::NotFound(_))));
        assert!(matches!(nested, Err(AppError::Validation(_))));
    }

    #[test]
    fn an_archived_parent_does_not_accept_new_subtasks() {
        let state = state();
        let task = parent(&state, "Parent");
        tasks::archive(&state, &task.id).expect("archives");

        let result = create(
            &state,
            CreateSubtaskInput {
                parent_task_id: task.id,
                title: "x".into(),
            },
        );

        assert!(matches!(result, Err(AppError::Conflict(_))));
    }

    #[test]
    fn the_subtask_limit_is_enforced() {
        let state = state();
        let task = parent(&state, "Parent");
        for index in 0..MAX_SUBTASKS_PER_TASK {
            subtask(&state, &task.id, &format!("S{index}"));
        }

        let result = create(
            &state,
            CreateSubtaskInput {
                parent_task_id: task.id.clone(),
                title: "one too many".into(),
            },
        );

        assert!(matches!(result, Err(AppError::Validation(_))));
        assert_eq!(titles(&state, &task.id).len(), MAX_SUBTASKS_PER_TASK);
    }

    #[test]
    fn list_of_a_missing_task_is_not_found() {
        let state = state();

        assert!(matches!(list(&state, "ghost"), Err(AppError::NotFound(_))));
    }

    #[test]
    fn completing_and_reopening_toggles_completed_at_and_logs_each_change() {
        let state = state();
        let task = parent(&state, "Parent");
        let step = subtask(&state, &task.id, "Step");

        let done = set_done(&state, &step.id, true).expect("completes");
        let reopened = set_done(&state, &step.id, false).expect("reopens");

        assert_eq!(done.completed_at.as_deref(), Some(done.updated_at.as_str()));
        assert_eq!(reopened.completed_at, None);
        let actions: Vec<ActivityAction> = task_entries(&state)
            .iter()
            .filter(|entry| entry.entity_id == step.id)
            .map(|entry| entry.action)
            .collect();
        assert_eq!(
            actions,
            [
                ActivityAction::Created,
                ActivityAction::Completed,
                ActivityAction::Reopened
            ]
        );
    }

    #[test]
    fn setting_the_state_it_already_has_changes_nothing_and_logs_nothing() {
        let state = state();
        let task = parent(&state, "Parent");
        let step = subtask(&state, &task.id, "Step");
        let before = task_entries(&state).len();

        let still_open = set_done(&state, &step.id, false).expect("no-op");
        let done = set_done(&state, &step.id, true).expect("completes");
        let again = set_done(&state, &step.id, true).expect("no-op");

        assert_eq!(still_open.updated_at, step.updated_at);
        assert_eq!(again, done);
        assert_eq!(task_entries(&state).len(), before + 1);
    }

    #[test]
    fn completion_applies_to_subtasks_only() {
        let state = state();
        let task = parent(&state, "Parent");

        let result = set_done(&state, &task.id, true);
        let missing = set_done(&state, "ghost", true);

        assert!(matches!(result, Err(AppError::Validation(_))));
        assert!(matches!(missing, Err(AppError::NotFound(_))));
    }

    #[test]
    fn completing_subtasks_never_completes_the_parent() {
        let state = state();
        let task = parent(&state, "Parent");
        let step = subtask(&state, &task.id, "Step");

        set_done(&state, &step.id, true).expect("completes");

        let reloaded = tasks::get(&state, &task.id).expect("reads");
        assert_eq!(reloaded.completed_at, None);
    }

    #[test]
    fn reordering_moves_a_subtask_to_the_first_middle_and_last_places() {
        let state = state();
        let task = parent(&state, "Parent");
        let a = subtask(&state, &task.id, "A");
        let b = subtask(&state, &task.id, "B");
        let c = subtask(&state, &task.id, "C");

        move_subtask(&state, &c.id, None).expect("C first");
        assert_eq!(titles(&state, &task.id), ["C", "A", "B"]);
        move_subtask(&state, &c.id, Some(a.id.clone())).expect("C after A");
        assert_eq!(titles(&state, &task.id), ["A", "C", "B"]);
        move_subtask(&state, &a.id, Some(b.id.clone())).expect("A last");
        assert_eq!(titles(&state, &task.id), ["C", "B", "A"]);
    }

    #[test]
    fn reordering_to_the_current_place_is_a_no_op() {
        let state = state();
        let task = parent(&state, "Parent");
        let a = subtask(&state, &task.id, "A");
        let b = subtask(&state, &task.id, "B");

        let first = move_subtask(&state, &a.id, None).expect("no-op");
        let second = move_subtask(&state, &b.id, Some(a.id.clone())).expect("no-op");

        assert_eq!(first, a);
        assert_eq!(second, b);
    }

    #[test]
    fn reordering_rejects_anchors_from_other_parents_and_non_subtasks() {
        let state = state();
        let first = parent(&state, "First");
        let second = parent(&state, "Second");
        let mine = subtask(&state, &first.id, "Mine");
        let theirs = subtask(&state, &second.id, "Theirs");

        let foreign_anchor = move_subtask(&state, &mine.id, Some(theirs.id));
        let top_level = move_subtask(&state, &first.id, None);
        let self_anchor = move_subtask(&state, &mine.id, Some(mine.id.clone()));

        assert!(matches!(foreign_anchor, Err(AppError::InvalidMove)));
        assert!(matches!(top_level, Err(AppError::Validation(_))));
        assert!(matches!(self_anchor, Err(AppError::InvalidMove)));
    }

    #[test]
    fn completed_subtasks_keep_their_place_in_the_order() {
        let state = state();
        let task = parent(&state, "Parent");
        let a = subtask(&state, &task.id, "A");
        subtask(&state, &task.id, "B");

        set_done(&state, &a.id, true).expect("completes");

        assert_eq!(titles(&state, &task.id), ["A", "B"]);
    }

    #[test]
    fn deleting_the_parent_deletes_its_subtasks() {
        let state = state();
        let task = parent(&state, "Parent");
        let step = subtask(&state, &task.id, "Step");

        tasks::delete(&state, &task.id).expect("deletes");

        assert!(matches!(
            tasks::get(&state, &step.id),
            Err(AppError::NotFound(_))
        ));
    }

    #[test]
    fn a_subtask_can_be_deleted_on_its_own() {
        let state = state();
        let task = parent(&state, "Parent");
        let step = subtask(&state, &task.id, "Step");
        subtask(&state, &task.id, "Keep");

        tasks::delete(&state, &step.id).expect("deletes");

        assert_eq!(titles(&state, &task.id), ["Keep"]);
    }

    #[test]
    fn subtasks_can_be_edited_with_update_task_but_not_archived() {
        let state = state();
        let task = parent(&state, "Parent");
        let step = subtask(&state, &task.id, "Step");

        let renamed = tasks::update(
            &state,
            &step.id,
            crate::modules::tasks::models::UpdateTaskInput {
                title: Some("Renamed".into()),
                ..Default::default()
            },
        )
        .expect("updates");
        let archived = tasks::archive(&state, &step.id);
        let restored = tasks::restore(&state, &step.id);

        assert_eq!(renamed.title, "Renamed");
        assert!(matches!(archived, Err(AppError::Validation(_))));
        assert!(matches!(restored, Err(AppError::Validation(_))));
    }

    #[test]
    fn subtasks_cannot_be_moved_onto_a_board_or_the_backlog() {
        let state = state();
        let task = parent(&state, "Parent");
        let step = subtask(&state, &task.id, "Step");

        let result = crate::modules::tasks::placement_service::send_to_backlog(&state, &step.id);

        assert!(matches!(result, Err(AppError::Validation(_))));
    }

    #[test]
    fn a_failing_activity_write_leaves_no_subtask_behind() {
        let state = state();
        let task = parent(&state, "Parent");
        state
            .database()
            .execute_batch("DROP TABLE activity_log;")
            .expect("drops log table");

        let result = create(
            &state,
            CreateSubtaskInput {
                parent_task_id: task.id.clone(),
                title: "Ghost".into(),
            },
        );

        assert!(result.is_err());
        assert!(
            repository::list_subtasks(&state.database(), &task.id)
                .expect("reads")
                .is_empty()
        );
    }
}
