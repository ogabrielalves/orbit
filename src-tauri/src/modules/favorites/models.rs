use serde::{Deserialize, Serialize};
use specta::Type;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "snake_case")]
pub enum FavoriteType {
    Project,
    Board,
    Task,
    Note,
    Folder,
}

impl FavoriteType {
    pub const ALL: [Self; 5] = [
        Self::Project,
        Self::Board,
        Self::Task,
        Self::Note,
        Self::Folder,
    ];

    pub fn as_str(self) -> &'static str {
        match self {
            Self::Project => "project",
            Self::Board => "board",
            Self::Task => "task",
            Self::Note => "note",
            Self::Folder => "folder",
        }
    }

    pub fn parse(value: &str) -> Option<Self> {
        Self::ALL.into_iter().find(|kind| kind.as_str() == value)
    }
}

/// Points at one favoritable thing: an id for projects, boards, tasks and notes, and the
/// relative path (`/` separated) for folders.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct FavoriteRef {
    pub entity_type: FavoriteType,
    pub entity_id: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct FavoriteEntry {
    pub entity_type: FavoriteType,
    pub entity_id: String,
    pub title: String,
    /// The project name for boards and tasks, the containing folder for notes and folders.
    pub context: Option<String>,
    pub project_id: Option<String>,
    pub board_id: Option<String>,
    pub parent_task_id: Option<String>,
    /// Relative path inside the vault, for notes and folders.
    pub path: Option<String>,
    /// True when the item (or the project or board it belongs to) is archived.
    pub is_archived: bool,
    pub created_at: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_type_round_trips_through_its_text_form_and_json() {
        for kind in FavoriteType::ALL {
            assert_eq!(FavoriteType::parse(kind.as_str()), Some(kind));
            assert_eq!(
                serde_json::to_value(kind).expect("serializes"),
                kind.as_str()
            );
        }
        assert_eq!(FavoriteType::parse("spaceship"), None);
    }

    #[test]
    fn a_reference_reads_camel_case_and_rejects_unknown_types() {
        let reference: FavoriteRef =
            serde_json::from_str(r#"{ "entityType": "note", "entityId": "n1" }"#).expect("parses");
        let unknown: Result<FavoriteRef, _> =
            serde_json::from_str(r#"{ "entityType": "tag", "entityId": "x" }"#);

        assert_eq!(reference.entity_type, FavoriteType::Note);
        assert_eq!(reference.entity_id, "n1");
        assert!(unknown.is_err());
    }

    #[test]
    fn entries_serialize_with_camel_case_keys() {
        let entry = FavoriteEntry {
            entity_type: FavoriteType::Task,
            entity_id: "t1".into(),
            title: "Fix".into(),
            context: Some("Website".into()),
            project_id: Some("p1".into()),
            board_id: None,
            parent_task_id: None,
            path: None,
            is_archived: false,
            created_at: "x".into(),
        };

        let json = serde_json::to_value(&entry).expect("serializes");

        assert_eq!(json["entityType"], "task");
        assert_eq!(json["isArchived"], false);
        assert_eq!(json["projectId"], "p1");
        assert_eq!(json["boardId"], serde_json::Value::Null);
    }
}
