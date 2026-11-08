use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use specta::Type;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "snake_case")]
pub enum EntityType {
    Project,
    Board,
    Column,
    Task,
    ChecklistItem,
    Comment,
    Tag,
    Attachment,
    Note,
    Folder,
}

impl EntityType {
    pub const ALL: [Self; 10] = [
        Self::Project,
        Self::Board,
        Self::Column,
        Self::Task,
        Self::ChecklistItem,
        Self::Comment,
        Self::Tag,
        Self::Attachment,
        Self::Note,
        Self::Folder,
    ];

    pub fn as_str(self) -> &'static str {
        match self {
            Self::Project => "project",
            Self::Board => "board",
            Self::Column => "column",
            Self::Task => "task",
            Self::ChecklistItem => "checklist_item",
            Self::Comment => "comment",
            Self::Tag => "tag",
            Self::Attachment => "attachment",
            Self::Note => "note",
            Self::Folder => "folder",
        }
    }

    pub fn parse(value: &str) -> Option<Self> {
        Self::ALL
            .into_iter()
            .find(|entity_type| entity_type.as_str() == value)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "lowercase")]
pub enum ActivityAction {
    Created,
    Updated,
    Deleted,
    Archived,
    Restored,
    Moved,
    Completed,
    Reopened,
    Duplicated,
}

impl ActivityAction {
    pub const ALL: [Self; 9] = [
        Self::Created,
        Self::Updated,
        Self::Deleted,
        Self::Archived,
        Self::Restored,
        Self::Moved,
        Self::Completed,
        Self::Reopened,
        Self::Duplicated,
    ];

    pub fn as_str(self) -> &'static str {
        match self {
            Self::Created => "created",
            Self::Updated => "updated",
            Self::Deleted => "deleted",
            Self::Archived => "archived",
            Self::Restored => "restored",
            Self::Moved => "moved",
            Self::Completed => "completed",
            Self::Reopened => "reopened",
            Self::Duplicated => "duplicated",
        }
    }

    pub fn parse(value: &str) -> Option<Self> {
        Self::ALL
            .into_iter()
            .find(|action| action.as_str() == value)
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct FieldChange {
    pub from: Option<String>,
    pub to: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct ChangeSet {
    fields: BTreeMap<String, FieldChange>,
}

impl ChangeSet {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn track(&mut self, field: &str, before: Option<&str>, after: Option<&str>) {
        let has_changed = before != after;
        if !has_changed {
            return;
        }
        let change = FieldChange {
            from: before.map(str::to_string),
            to: after.map(str::to_string),
        };
        self.fields.insert(field.to_string(), change);
    }

    pub fn is_empty(&self) -> bool {
        self.fields.is_empty()
    }

    pub fn into_fields(self) -> BTreeMap<String, FieldChange> {
        self.fields
    }

    pub fn from_fields(fields: BTreeMap<String, FieldChange>) -> Self {
        Self { fields }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ActivityEntry {
    pub id: String,
    pub entity_type: EntityType,
    pub entity_id: String,
    pub action: ActivityAction,
    pub changes: Option<BTreeMap<String, FieldChange>>,
    pub created_at: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn entity_types_round_trip_through_their_text_form() {
        for entity_type in EntityType::ALL {
            assert_eq!(EntityType::parse(entity_type.as_str()), Some(entity_type));
        }
        assert_eq!(EntityType::parse("spaceship"), None);
    }

    #[test]
    fn actions_round_trip_through_their_text_form() {
        for action in ActivityAction::ALL {
            assert_eq!(ActivityAction::parse(action.as_str()), Some(action));
        }
        assert_eq!(ActivityAction::parse("exploded"), None);
    }

    #[test]
    fn serde_names_match_the_text_stored_in_the_database() {
        for entity_type in EntityType::ALL {
            let json = serde_json::to_value(entity_type).expect("serializes");
            assert_eq!(json, entity_type.as_str());
        }
        for action in ActivityAction::ALL {
            let json = serde_json::to_value(action).expect("serializes");
            assert_eq!(json, action.as_str());
        }
    }

    #[test]
    fn change_set_tracks_only_fields_that_differ() {
        let mut changes = ChangeSet::new();

        changes.track("name", Some("Old"), Some("New"));
        changes.track("color", Some("red"), Some("red"));
        changes.track("icon", None, None);

        let fields = changes.into_fields();
        assert_eq!(fields.len(), 1);
        assert_eq!(fields["name"].from.as_deref(), Some("Old"));
        assert_eq!(fields["name"].to.as_deref(), Some("New"));
    }

    #[test]
    fn change_set_records_set_and_clear_as_null_on_one_side() {
        let mut changes = ChangeSet::new();

        changes.track("icon", None, Some("rocket"));
        changes.track("color", Some("red"), None);

        let fields = changes.into_fields();
        assert_eq!(fields["icon"].from, None);
        assert_eq!(fields["icon"].to.as_deref(), Some("rocket"));
        assert_eq!(fields["color"].to, None);
    }

    #[test]
    fn change_set_is_empty_until_something_changes() {
        let mut changes = ChangeSet::new();
        assert!(changes.is_empty());

        changes.track("name", Some("A"), Some("A"));
        assert!(changes.is_empty());

        changes.track("name", Some("A"), Some("B"));
        assert!(!changes.is_empty());
    }

    #[test]
    fn entry_serializes_with_camel_case_keys() {
        let entry = ActivityEntry {
            id: "a1".into(),
            entity_type: EntityType::ChecklistItem,
            entity_id: "e1".into(),
            action: ActivityAction::Updated,
            changes: None,
            created_at: "2026-11-08T10:00:00.000Z".into(),
        };

        let json = serde_json::to_value(&entry).expect("serializes");

        assert_eq!(json["entityType"], "checklist_item");
        assert_eq!(json["entityId"], "e1");
        assert_eq!(json["createdAt"], "2026-11-08T10:00:00.000Z");
        assert_eq!(json["changes"], serde_json::Value::Null);
    }
}
