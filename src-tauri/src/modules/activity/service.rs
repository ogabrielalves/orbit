use rusqlite::Connection;

use super::models::{ActivityAction, ActivityEntry, ChangeSet, EntityType};
use super::repository::{self, NewRow, StoredRow};
use crate::error::{AppError, AppResult};
use crate::shared::{id, time};
use crate::state::AppState;

pub const DEFAULT_RECENT_LIMIT: u32 = 20;
pub const MAX_RECENT_LIMIT: u32 = 100;
pub const DEFAULT_HISTORY_LIMIT: u32 = 50;
pub const MAX_HISTORY_LIMIT: u32 = 200;

pub fn record(
    connection: &Connection,
    entity_type: EntityType,
    entity_id: &str,
    action: ActivityAction,
    changes: ChangeSet,
) -> AppResult<()> {
    let changes_json = serialize_changes(changes)?;
    let entry_id = id::new_id();
    let created_at = time::now();
    let task_id = repository::find_task_id(connection, entity_type.as_str(), entity_id)?;
    let row = NewRow {
        id: &entry_id,
        entity_type: entity_type.as_str(),
        entity_id,
        action: action.as_str(),
        changes: changes_json.as_deref(),
        task_id: task_id.as_deref(),
        created_at: &created_at,
    };
    repository::insert(connection, &row)
}

pub fn recent(state: &AppState, limit: Option<u32>) -> AppResult<Vec<ActivityEntry>> {
    let effective_limit = limit
        .unwrap_or(DEFAULT_RECENT_LIMIT)
        .clamp(1, MAX_RECENT_LIMIT);
    let connection = state.database();
    let rows = repository::find_recent(&connection, effective_limit)?;
    rows.into_iter().map(to_entry).collect()
}

pub fn history(
    state: &AppState,
    entity_type: EntityType,
    entity_id: &str,
    limit: Option<u32>,
) -> AppResult<Vec<ActivityEntry>> {
    let effective_limit = limit
        .unwrap_or(DEFAULT_HISTORY_LIMIT)
        .clamp(1, MAX_HISTORY_LIMIT);
    let connection = state.database();
    let rows = repository::find_by_entity(
        &connection,
        entity_type.as_str(),
        entity_id,
        effective_limit,
    )?;
    rows.into_iter().map(to_entry).collect()
}

pub fn task_history(
    state: &AppState,
    task_id: &str,
    limit: Option<u32>,
) -> AppResult<Vec<ActivityEntry>> {
    let effective_limit = limit
        .unwrap_or(DEFAULT_HISTORY_LIMIT)
        .clamp(1, MAX_HISTORY_LIMIT);
    let connection = state.database();
    let rows = repository::find_for_task(&connection, task_id, effective_limit)?;
    rows.into_iter().map(to_entry).collect()
}

fn serialize_changes(changes: ChangeSet) -> AppResult<Option<String>> {
    let has_no_changes = changes.is_empty();
    if has_no_changes {
        return Ok(None);
    }
    let json = serde_json::to_string(&changes.into_fields())?;
    Ok(Some(json))
}

fn to_entry(row: StoredRow) -> AppResult<ActivityEntry> {
    let entity_type = EntityType::parse(&row.entity_type).ok_or_else(|| {
        log::error!("unknown entity type '{}' in activity log", row.entity_type);
        AppError::Internal
    })?;
    let action = ActivityAction::parse(&row.action).ok_or_else(|| {
        log::error!("unknown action '{}' in activity log", row.action);
        AppError::Internal
    })?;
    let changes = row
        .changes
        .as_deref()
        .map(serde_json::from_str)
        .transpose()?;
    Ok(ActivityEntry {
        id: row.id,
        entity_type,
        entity_id: row.entity_id,
        action,
        changes,
        created_at: row.created_at,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{connection::open_in_memory, migrations};

    fn state() -> AppState {
        let mut connection = open_in_memory().expect("opens");
        migrations::run(&mut connection).expect("migrates");
        AppState::new(connection, None)
    }

    fn record_created(state: &AppState, entity_id: &str) {
        let connection = state.database();
        record(
            &connection,
            EntityType::Project,
            entity_id,
            ActivityAction::Created,
            ChangeSet::new(),
        )
        .expect("records");
    }

    fn name_change(from: &str, to: &str) -> ChangeSet {
        let mut changes = ChangeSet::new();
        changes.track("name", Some(from), Some(to));
        changes
    }

    #[test]
    fn record_stores_entity_action_and_timestamp() {
        let state = state();

        record_created(&state, "p1");

        let entries = recent(&state, None).expect("reads");
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].entity_type, EntityType::Project);
        assert_eq!(entries[0].entity_id, "p1");
        assert_eq!(entries[0].action, ActivityAction::Created);
        assert_eq!(entries[0].id.len(), 36);
        assert!(entries[0].created_at.ends_with('Z'));
    }

    #[test]
    fn record_without_changes_stores_null() {
        let state = state();

        record_created(&state, "p1");

        let entries = recent(&state, None).expect("reads");
        assert_eq!(entries[0].changes, None);
    }

    #[test]
    fn record_stores_the_field_diff_as_a_json_object() {
        let state = state();
        {
            let connection = state.database();
            record(
                &connection,
                EntityType::Project,
                "p1",
                ActivityAction::Updated,
                name_change("Old", "New"),
            )
            .expect("records");
        }

        let raw: String = state
            .database()
            .query_row("SELECT changes FROM activity_log", [], |row| row.get(0))
            .expect("reads raw");
        let entries = recent(&state, None).expect("reads");

        assert_eq!(raw, r#"{"name":{"from":"Old","to":"New"}}"#);
        let changes = entries[0].changes.as_ref().expect("has changes");
        assert_eq!(changes["name"].from.as_deref(), Some("Old"));
        assert_eq!(changes["name"].to.as_deref(), Some("New"));
    }

    #[test]
    fn record_inside_a_rolled_back_transaction_leaves_no_trace() {
        let state = state();
        {
            let mut connection = state.database();
            let transaction = connection.transaction().expect("begins");
            record(
                &transaction,
                EntityType::Task,
                "t1",
                ActivityAction::Created,
                ChangeSet::new(),
            )
            .expect("records");
            transaction.rollback().expect("rolls back");
        }

        assert!(recent(&state, None).expect("reads").is_empty());
    }

    #[test]
    fn record_inside_a_committed_transaction_is_kept() {
        let state = state();
        {
            let mut connection = state.database();
            let transaction = connection.transaction().expect("begins");
            record(
                &transaction,
                EntityType::Task,
                "t1",
                ActivityAction::Created,
                ChangeSet::new(),
            )
            .expect("records");
            transaction.commit().expect("commits");
        }

        assert_eq!(recent(&state, None).expect("reads").len(), 1);
    }

    #[test]
    fn recent_returns_the_newest_entries_first() {
        let state = state();
        record_created(&state, "first");
        std::thread::sleep(std::time::Duration::from_millis(3));
        record_created(&state, "second");

        let entries = recent(&state, None).expect("reads");

        assert_eq!(entries[0].entity_id, "second");
        assert_eq!(entries[1].entity_id, "first");
    }

    #[test]
    fn recent_defaults_to_twenty_entries() {
        let state = state();
        for index in 0..25 {
            record_created(&state, &format!("p{index}"));
        }

        let entries = recent(&state, None).expect("reads");

        assert_eq!(entries.len(), DEFAULT_RECENT_LIMIT as usize);
    }

    #[test]
    fn recent_clamps_the_limit_between_one_and_the_maximum() {
        let state = state();
        for index in 0..105 {
            record_created(&state, &format!("p{index}"));
        }

        let none = recent(&state, Some(0)).expect("reads");
        let some = recent(&state, Some(7)).expect("reads");
        let huge = recent(&state, Some(10_000)).expect("reads");

        assert_eq!(none.len(), 1);
        assert_eq!(some.len(), 7);
        assert_eq!(huge.len(), MAX_RECENT_LIMIT as usize);
    }

    #[test]
    fn every_entity_type_and_action_is_accepted_by_the_database() {
        let state = state();
        let connection = state.database();

        for entity_type in EntityType::ALL {
            for action in ActivityAction::ALL {
                let result = record(&connection, entity_type, "e1", action, ChangeSet::new());
                assert!(
                    result.is_ok(),
                    "{} / {} should be accepted",
                    entity_type.as_str(),
                    action.as_str()
                );
            }
        }
    }

    #[test]
    fn corrupt_changes_json_surfaces_as_an_internal_error() {
        let state = state();
        state
            .database()
            .execute_batch("PRAGMA ignore_check_constraints = ON;")
            .expect("disables check");
        state
            .database()
            .execute(
                "INSERT INTO activity_log (id, entity_type, entity_id, action, changes, created_at) VALUES ('a1', 'task', 't1', 'created', '{broken', '2026-11-08T10:00:00.000Z')",
                [],
            )
            .expect("inserts corrupt row");

        let result = recent(&state, None);

        assert!(matches!(result, Err(AppError::Internal)));
    }

    #[test]
    fn history_returns_only_the_entity_entries_newest_first() {
        let state = state();
        {
            let connection = state.database();
            for (entity_type, entity_id, action) in [
                (EntityType::Task, "t1", ActivityAction::Created),
                (EntityType::Task, "t2", ActivityAction::Created),
                (EntityType::Task, "t1", ActivityAction::Archived),
                (EntityType::Comment, "t1", ActivityAction::Created),
            ] {
                record(
                    &connection,
                    entity_type,
                    entity_id,
                    action,
                    ChangeSet::new(),
                )
                .expect("records");
                std::thread::sleep(std::time::Duration::from_millis(2));
            }
        }

        let entries = history(&state, EntityType::Task, "t1", None).expect("reads");

        let actions: Vec<ActivityAction> = entries.iter().map(|entry| entry.action).collect();
        assert_eq!(actions, [ActivityAction::Archived, ActivityAction::Created]);
        assert!(entries.iter().all(|entry| entry.entity_id == "t1"));
    }

    #[test]
    fn history_clamps_the_limit_and_defaults_to_fifty() {
        let state = state();
        {
            let connection = state.database();
            for _ in 0..(MAX_HISTORY_LIMIT + 5) {
                record(
                    &connection,
                    EntityType::Task,
                    "t1",
                    ActivityAction::Updated,
                    ChangeSet::new(),
                )
                .expect("records");
            }
        }

        let default = history(&state, EntityType::Task, "t1", None).expect("reads");
        let zero = history(&state, EntityType::Task, "t1", Some(0)).expect("reads");
        let huge = history(&state, EntityType::Task, "t1", Some(10_000)).expect("reads");

        assert_eq!(default.len(), DEFAULT_HISTORY_LIMIT as usize);
        assert_eq!(zero.len(), 1);
        assert_eq!(huge.len(), MAX_HISTORY_LIMIT as usize);
    }

    #[test]
    fn history_of_an_unknown_entity_is_empty() {
        let state = state();

        let entries = history(&state, EntityType::Task, "ghost", None).expect("reads");

        assert!(entries.is_empty());
    }
}
