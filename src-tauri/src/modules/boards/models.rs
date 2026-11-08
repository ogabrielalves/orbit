use serde::{Deserialize, Serialize};
use specta::Type;

use crate::shared::id;
use crate::shared::patch::distinguish_null_from_absent;

pub const DEFAULT_COLUMN_NAMES: [&str; 5] =
    ["Backlog", "To Do", "In Progress", "In Review", "Done"];

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct Board {
    pub id: String,
    pub project_id: String,
    pub name: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct BoardColumn {
    pub id: String,
    pub board_id: String,
    pub name: String,
    pub position: String,
    pub color: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub task_count: u32,
}

impl BoardColumn {
    pub fn new(
        board_id: &str,
        name: String,
        color: Option<String>,
        position: String,
        now: &str,
    ) -> Self {
        Self {
            id: id::new_id(),
            board_id: board_id.to_string(),
            name,
            position,
            color,
            created_at: now.to_string(),
            updated_at: now.to_string(),
            task_count: 0,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct BoardDetails {
    pub board: Board,
    pub columns: Vec<BoardColumn>,
}

#[derive(Debug, Clone, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct CreateBoardInput {
    pub project_id: String,
    pub name: String,
    #[serde(default)]
    pub column_names: Option<Vec<String>>,
}

#[derive(Debug, Clone, Default, Deserialize, Type)]
#[serde(rename_all = "camelCase", default)]
pub struct UpdateBoardInput {
    pub name: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct CreateColumnInput {
    pub board_id: String,
    pub name: String,
    #[serde(default)]
    pub color: Option<String>,
}

#[derive(Debug, Clone, Default, Deserialize, Type)]
#[serde(rename_all = "camelCase", default)]
pub struct UpdateColumnInput {
    pub name: Option<String>,
    #[serde(deserialize_with = "distinguish_null_from_absent")]
    #[specta(type = Option<String>)]
    pub color: Option<Option<String>>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_column_names_are_the_five_documented_stages() {
        assert_eq!(
            DEFAULT_COLUMN_NAMES,
            ["Backlog", "To Do", "In Progress", "In Review", "Done"]
        );
    }

    #[test]
    fn column_serializes_with_camel_case_keys() {
        let column = BoardColumn {
            id: "c1".into(),
            board_id: "b1".into(),
            name: "To Do".into(),
            position: "V".into(),
            color: None,
            created_at: "2026-11-08T10:00:00.000Z".into(),
            updated_at: "2026-11-08T10:00:00.000Z".into(),
            task_count: 3,
        };

        let json = serde_json::to_value(&column).expect("serializes");

        assert_eq!(json["boardId"], "b1");
        assert_eq!(json["taskCount"], 3);
        assert_eq!(json["color"], serde_json::Value::Null);
    }

    #[test]
    fn new_column_gets_a_fresh_id_and_matching_timestamps() {
        let first = BoardColumn::new(
            "b1",
            "A".into(),
            None,
            "V".into(),
            "2026-11-08T10:00:00.000Z",
        );
        let second = BoardColumn::new(
            "b1",
            "A".into(),
            None,
            "V".into(),
            "2026-11-08T10:00:00.000Z",
        );

        assert_ne!(first.id, second.id);
        assert_eq!(first.board_id, "b1");
        assert_eq!(first.created_at, first.updated_at);
        assert_eq!(first.task_count, 0);
    }

    #[test]
    fn create_board_input_only_requires_project_and_name() {
        let input: CreateBoardInput =
            serde_json::from_str(r#"{ "projectId": "p1", "name": "Sprint" }"#).expect("parses");

        assert_eq!(input.project_id, "p1");
        assert_eq!(input.column_names, None);
    }

    #[test]
    fn create_board_input_distinguishes_missing_from_empty_column_names() {
        let missing: CreateBoardInput =
            serde_json::from_str(r#"{ "projectId": "p", "name": "n" }"#).expect("parses");
        let empty: CreateBoardInput =
            serde_json::from_str(r#"{ "projectId": "p", "name": "n", "columnNames": [] }"#)
                .expect("parses");
        let named: CreateBoardInput =
            serde_json::from_str(r#"{ "projectId": "p", "name": "n", "columnNames": ["A", "B"] }"#)
                .expect("parses");

        assert_eq!(missing.column_names, None);
        assert_eq!(empty.column_names, Some(vec![]));
        assert_eq!(
            named.column_names,
            Some(vec!["A".to_string(), "B".to_string()])
        );
    }

    #[test]
    fn create_column_input_requires_board_and_name() {
        let result: Result<CreateColumnInput, _> = serde_json::from_str(r#"{ "name": "x" }"#);

        assert!(result.is_err());
    }

    #[test]
    fn update_column_input_tells_cleared_color_from_untouched_color() {
        let cleared: UpdateColumnInput =
            serde_json::from_str(r#"{ "color": null }"#).expect("parses");
        let untouched: UpdateColumnInput =
            serde_json::from_str(r#"{ "name": "x" }"#).expect("parses");

        assert_eq!(cleared.color, Some(None));
        assert_eq!(untouched.color, None);
    }
}
