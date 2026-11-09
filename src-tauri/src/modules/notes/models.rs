use serde::{Deserialize, Serialize};
use specta::Type;

/// A row of the `notes` index. The Markdown file is the source of truth; this is derived data.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NoteRecord {
    pub id: String,
    /// Relative to the vault root, always with `/` separators.
    pub path: String,
    pub title: String,
    pub title_key: String,
    pub hash: String,
    pub created_at: String,
    pub modified_at: String,
}

/// One distinct target a note links to.
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
    /// Relative to the vault root, `/` separated.
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
    /// The Markdown text without the frontmatter, which ORBIT manages itself.
    pub content: String,
    /// Hash of the file as it was read. Send it back as `baseHash` when saving, so edits made
    /// outside ORBIT in the meantime are detected instead of overwritten.
    pub hash: String,
}

#[derive(Debug, Clone, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct CreateNoteInput {
    /// Folder to create the note in; omitted or empty means the vault root.
    #[serde(default)]
    pub folder_path: Option<String>,
    /// Also the file name (`<title>.md`) and the note's first heading.
    pub title: String,
    /// Initial Markdown text. Defaults to a heading with the title.
    #[serde(default)]
    pub content: Option<String>,
    #[serde(default)]
    pub tags: Option<Vec<String>>,
}

#[derive(Debug, Clone, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SaveNoteInput {
    pub content: String,
    /// The `hash` the note had when it was read.
    pub base_hash: String,
    /// New tags; omitted keeps the current ones.
    #[serde(default)]
    pub tags: Option<Vec<String>>,
    /// Save even if the file changed outside ORBIT since `baseHash` (overwrites those changes).
    #[serde(default)]
    pub force: bool,
}

#[derive(Debug, Clone, Default, Deserialize, Type)]
#[serde(rename_all = "camelCase", default)]
pub struct ListNotesInput {
    /// Only notes of this folder; omitted lists every note of the vault.
    pub folder_path: Option<String>,
    /// With `folderPath`, also include the notes of its subfolders.
    pub include_subfolders: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct RenameNoteResult {
    pub note: NoteSummary,
    /// Other notes whose `[[links]]` were rewritten to the new title.
    pub rewritten_notes: u32,
}

/// A `[[link]]` written in a note and the note it currently resolves to, if any.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct OutgoingLink {
    /// The title as written in the note.
    pub target_title: String,
    /// How many times the note links to it.
    pub link_count: u32,
    /// `None` when no note has that title (an unresolved link).
    pub resolved: Option<NoteSummary>,
}

/// A note that links to another one.
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

/// A title that notes link to but that no note has, with the notes that link to it.
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
