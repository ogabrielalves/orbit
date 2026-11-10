use serde::{Deserialize, Serialize};
use specta::Type;

pub const DEFAULT_LIMIT_PER_CATEGORY: u32 = 8;
pub const MAX_LIMIT_PER_CATEGORY: u32 = 50;

#[derive(Debug, Clone, Default, Deserialize, Type)]
#[serde(rename_all = "camelCase", default)]
pub struct SearchInput {
    pub query: String,
    /// Results per category (default 8, at most 50).
    pub limit_per_category: Option<u32>,
}

/// A piece of text, flagged when it is what the query matched. Rendering a list of these as plain
/// text with the flagged parts emphasized needs no HTML handling.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct TextPart {
    pub text: String,
    pub is_match: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SearchHit {
    /// Project, board, task and note ids; the relative path for folders.
    pub entity_id: String,
    pub title: Vec<TextPart>,
    /// The part of the text (description, note body, path) around the match.
    pub snippet: Vec<TextPart>,
    /// Where it lives: the project name for boards and tasks, the folder for notes and folders.
    pub context: Option<String>,
    pub project_id: Option<String>,
    pub board_id: Option<String>,
    pub parent_task_id: Option<String>,
    /// Relative path inside the vault, for notes and folders.
    pub path: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SearchResults {
    pub projects: Vec<SearchHit>,
    pub boards: Vec<SearchHit>,
    pub tasks: Vec<SearchHit>,
    pub notes: Vec<SearchHit>,
    pub folders: Vec<SearchHit>,
}

impl SearchResults {
    pub fn total(&self) -> usize {
        self.projects.len()
            + self.boards.len()
            + self.tasks.len()
            + self.notes.len()
            + self.folders.len()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn input_defaults_to_an_empty_query_and_the_default_limit() {
        let input: SearchInput = serde_json::from_str("{}").expect("parses");

        assert_eq!(input.query, "");
        assert_eq!(input.limit_per_category, None);
    }

    #[test]
    fn input_reads_camel_case() {
        let input: SearchInput =
            serde_json::from_str(r#"{ "query": "spring", "limitPerCategory": 3 }"#)
                .expect("parses");

        assert_eq!(input.query, "spring");
        assert_eq!(input.limit_per_category, Some(3));
    }

    #[test]
    fn hits_serialize_with_camel_case_keys() {
        let hit = SearchHit {
            entity_id: "t1".into(),
            title: vec![TextPart {
                text: "Fix".into(),
                is_match: true,
            }],
            snippet: vec![],
            context: Some("Website".into()),
            project_id: Some("p1".into()),
            board_id: None,
            parent_task_id: None,
            path: None,
        };

        let json = serde_json::to_value(&hit).expect("serializes");

        assert_eq!(json["entityId"], "t1");
        assert_eq!(json["title"][0]["isMatch"], true);
        assert_eq!(json["projectId"], "p1");
        assert_eq!(json["boardId"], serde_json::Value::Null);
    }

    #[test]
    fn totals_add_up_every_category() {
        let hit = SearchHit {
            entity_id: "x".into(),
            title: vec![],
            snippet: vec![],
            context: None,
            project_id: None,
            board_id: None,
            parent_task_id: None,
            path: None,
        };
        let results = SearchResults {
            projects: vec![hit.clone()],
            tasks: vec![hit.clone(), hit.clone()],
            notes: vec![hit],
            ..Default::default()
        };

        assert_eq!(results.total(), 4);
        assert_eq!(SearchResults::default().total(), 0);
    }
}
