use serde::{Deserialize, Serialize};
use specta::Type;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NoteRecord {
    pub id: String,
    pub path: String,
    pub title: String,
    pub title_key: String,
    pub hash: String,
    pub created_at: String,
    pub modified_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LinkRecord {
    pub target_key: String,
    pub target_title: String,
    pub link_count: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct NoteSummary {
    pub id: String,
    pub path: String,
    pub title: String,
    pub created_at: String,
    pub modified_at: String,
}

impl From<NoteRecord> for NoteSummary {
    fn from(record: NoteRecord) -> Self {
        Self {
            id: record.id,
            path: record.path,
            title: record.title,
            created_at: record.created_at,
            modified_at: record.modified_at,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct NoteDetails {
    pub id: String,
    pub path: String,
    pub title: String,
    pub tags: Vec<String>,
    pub created_at: String,
    pub modified_at: String,
    pub content: String,
    pub hash: String,
}

#[derive(Debug, Clone, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct CreateNoteInput {
    #[serde(default)]
    pub folder_path: Option<String>,
    pub title: String,
    #[serde(default)]
    pub content: Option<String>,
    #[serde(default)]
    pub tags: Option<Vec<String>>,
}

#[derive(Debug, Clone, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SaveNoteInput {
    pub content: String,
    pub base_hash: String,
    #[serde(default)]
    pub tags: Option<Vec<String>>,
    #[serde(default)]
    pub force: bool,
}

#[derive(Debug, Clone, Default, Deserialize, Type)]
#[serde(rename_all = "camelCase", default)]
pub struct ListNotesInput {
    pub folder_path: Option<String>,
    pub include_subfolders: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct RenameNoteResult {
    pub note: NoteSummary,
    pub rewritten_notes: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct OutgoingLink {
    pub target_title: String,
    pub link_count: u32,
    pub resolved: Option<NoteSummary>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct Backlink {
    pub note: NoteSummary,
    pub link_count: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct NoteLinks {
    pub outgoing: Vec<OutgoingLink>,
    pub backlinks: Vec<Backlink>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct UnresolvedLink {
    pub target_title: String,
    pub sources: Vec<NoteSummary>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn details_serialize_with_camel_case_keys() {
        let details = NoteDetails {
            id: "n1".into(),
            path: "a.md".into(),
            title: "A".into(),
            tags: vec!["x".into()],
            created_at: "c".into(),
            modified_at: "m".into(),
            content: "# A".into(),
            hash: "h".into(),
        };

        let json = serde_json::to_value(&details).expect("serializes");

        assert_eq!(json["createdAt"], "c");
        assert_eq!(json["modifiedAt"], "m");
        assert_eq!(json["tags"], serde_json::json!(["x"]));
        assert_eq!(json["hash"], "h");
    }

    #[test]
    fn create_input_only_requires_a_title() {
        let input: CreateNoteInput =
            serde_json::from_str(r#"{ "title": "Idea" }"#).expect("parses");
        let missing: Result<CreateNoteInput, _> = serde_json::from_str("{}");

        assert_eq!(input.folder_path, None);
        assert_eq!(input.content, None);
        assert_eq!(input.tags, None);
        assert!(missing.is_err());
    }

    #[test]
    fn save_input_requires_content_and_a_base_hash_and_defaults_to_not_forcing() {
        let input: SaveNoteInput =
            serde_json::from_str(r#"{ "content": "x", "baseHash": "h" }"#).expect("parses");
        let missing_hash: Result<SaveNoteInput, _> = serde_json::from_str(r#"{ "content": "x" }"#);

        assert!(!input.force);
        assert_eq!(input.tags, None);
        assert!(missing_hash.is_err());
    }

    #[test]
    fn list_input_defaults_to_every_note() {
        let input: ListNotesInput = serde_json::from_str("{}").expect("parses");

        assert_eq!(input.folder_path, None);
        assert!(!input.include_subfolders);
    }

    #[test]
    fn a_record_converts_to_a_summary_without_the_index_internals() {
        let record = NoteRecord {
            id: "n1".into(),
            path: "dir/a.md".into(),
            title: "A".into(),
            title_key: "a".into(),
            hash: "h".repeat(64),
            created_at: "c".into(),
            modified_at: "m".into(),
        };

        let summary = NoteSummary::from(record);
        let json = serde_json::to_value(&summary).expect("serializes");

        assert_eq!(summary.path, "dir/a.md");
        assert!(json.get("hash").is_none());
        assert!(json.get("titleKey").is_none());
    }

    #[test]
    fn link_dtos_serialize_with_camel_case_keys() {
        let summary = NoteSummary {
            id: "n1".into(),
            path: "a.md".into(),
            title: "A".into(),
            created_at: "c".into(),
            modified_at: "m".into(),
        };
        let links = NoteLinks {
            outgoing: vec![OutgoingLink {
                target_title: "B".into(),
                link_count: 2,
                resolved: None,
            }],
            backlinks: vec![Backlink {
                note: summary,
                link_count: 1,
            }],
        };

        let json = serde_json::to_value(&links).expect("serializes");

        assert_eq!(json["outgoing"][0]["targetTitle"], "B");
        assert_eq!(json["outgoing"][0]["linkCount"], 2);
        assert_eq!(json["outgoing"][0]["resolved"], serde_json::Value::Null);
        assert_eq!(json["backlinks"][0]["note"]["id"], "n1");
    }
}
