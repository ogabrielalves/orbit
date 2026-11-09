use serde::{Deserialize, Serialize};
use specta::Type;

/// A directory of the vault. Folders are real directories; this is only a view of them.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct FolderEntry {
    /// Relative to the vault root, `/` separated.
    pub path: String,
    pub name: String,
    /// Notes directly inside this folder (not in its subfolders).
    pub note_count: u32,
}

#[derive(Debug, Clone, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct CreateFolderInput {
    /// Where to create it; omitted or empty means the vault root.
    #[serde(default)]
    pub parent_path: Option<String>,
    pub name: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn folder_entries_serialize_with_camel_case_keys() {
        let entry = FolderEntry {
            path: "Projects/Web".into(),
            name: "Web".into(),
            note_count: 3,
        };

        let json = serde_json::to_value(&entry).expect("serializes");

        assert_eq!(json["path"], "Projects/Web");
        assert_eq!(json["noteCount"], 3);
    }

    #[test]
    fn the_parent_is_optional_when_creating() {
        let root: CreateFolderInput =
            serde_json::from_str(r#"{ "name": "Inbox" }"#).expect("parses");
        let nested: CreateFolderInput =
            serde_json::from_str(r#"{ "parentPath": "Projects", "name": "Web" }"#).expect("parses");
        let missing_name: Result<CreateFolderInput, _> = serde_json::from_str("{}");

        assert_eq!(root.parent_path, None);
        assert_eq!(nested.parent_path.as_deref(), Some("Projects"));
        assert!(missing_name.is_err());
    }
}
