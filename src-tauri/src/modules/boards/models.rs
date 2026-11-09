use serde::{Deserialize, Serialize};
use specta::Type;

use crate::shared::id;
use crate::shared::patch::distinguish_null_from_absent;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "snake_case")]
pub enum ColumnKind {
    Todo,
    InProgress,
    Done,
}

impl ColumnKind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Todo => "todo",
            Self::InProgress => "in_progress",
            Self::Done => "done",
        }
    }

    pub fn parse(text: &str) -> Option<Self> {
        match text {
            "todo" => Some(Self::Todo),
            "in_progress" => Some(Self::InProgress),
            "done" => Some(Self::Done),
            _ => None,
        }
    }
}

pub const DEFAULT_COLUMNS: [(&str, ColumnKind); 5] = [
    ("Backlog", ColumnKind::Todo),
    ("To Do", ColumnKind::Todo),
    ("In Progress", ColumnKind::InProgress),
    ("In Review", ColumnKind::InProgress),
    ("Done", ColumnKind::Done),
];

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
    pub kind: ColumnKind,
    pub created_at: String,
    pub updated_at: String,
    pub task_count: u32,
}

impl BoardColumn {
    pub fn new(
        board_id: &str,
        name: String,
        color: Option<String>,
        kind: ColumnKind,
        position: String,
        now: &str,
    ) -> Self {
        Self {
            id: id::new_id(),
            board_id: board_id.to_string(),
            name,
            position,
            color,
            kind,
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
    pub columns: Option<Vec<NewColumn>>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct NewColumn {
    pub name: String,
    pub kind: ColumnKind,
}

impl NewColumn {
    pub fn new(name: &str, kind: ColumnKind) -> Self {
        Self {
            name: name.to_string(),
            kind,
        }
    }
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
    #[serde(default)]
    pub kind: Option<ColumnKind>,
}

#[derive(Debug, Clone, Default, Deserialize, Type)]
#[serde(rename_all = "camelCase", default)]
pub struct UpdateColumnInput {
    pub name: Option<String>,
    pub kind: Option<ColumnKind>,
    #[serde(deserialize_with = "distinguish_null_from_absent")]
    #[specta(type = Option<String>)]
    pub color: Option<Option<String>>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_columns_are_the_five_documented_stages_with_their_kinds() {
        assert_eq!(
            DEFAULT_COLUMNS,
            [
                ("Backlog", ColumnKind::Todo),
                ("To Do", ColumnKind::Todo),
                ("In Progress", ColumnKind::InProgress),
                ("In Review", ColumnKind::InProgress),
                ("Done", ColumnKind::Done),
            ]
        );
    }

    #[test]
    fn column_kind_round_trips_through_text_and_json() {
        for kind in [ColumnKind::Todo, ColumnKind::InProgress, ColumnKind::Done] {
            assert_eq!(ColumnKind::parse(kind.as_str()), Some(kind));
            let json = serde_json::to_string(&kind).expect("serializes");
            assert_eq!(json, format!("\"{}\"", kind.as_str()));
        }
        assert_eq!(ColumnKind::parse("doing"), None);
    }

    #[test]
    fn column_serializes_with_camel_case_keys() {
        let column = BoardColumn {
            id: "c1".into(),
            board_id: "b1".into(),
            name: "To Do".into(),
            position: "V".into(),
            color: None,
            kind: ColumnKind::InProgress,
            created_at: "2026-11-08T10:00:00.000Z".into(),
            updated_at: "2026-11-08T10:00:00.000Z".into(),
            task_count: 3,
        };

        let json = serde_json::to_value(&column).expect("serializes");

        assert_eq!(json["boardId"], "b1");
        assert_eq!(json["taskCount"], 3);
        assert_eq!(json["color"], serde_json::Value::Null);
        assert_eq!(json["kind"], "in_progress");
    }

    #[test]
    fn new_column_gets_a_fresh_id_and_matching_timestamps() {
        let first = BoardColumn::new(
            "b1",
            "A".into(),
            None,
            ColumnKind::Todo,
            "V".into(),
            "2026-11-08T10:00:00.000Z",
        );
        let second = BoardColumn::new(
            "b1",
            "A".into(),
            None,
            ColumnKind::Todo,
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
        assert_eq!(input.columns, None);
    }

    #[test]
    fn create_board_input_distinguishes_missing_from_empty_columns() {
        let missing: CreateBoardInput =
            serde_json::from_str(r#"{ "projectId": "p", "name": "n" }"#).expect("parses");
        let empty: CreateBoardInput =
            serde_json::from_str(r#"{ "projectId": "p", "name": "n", "columns": [] }"#)
                .expect("parses");
        let named: CreateBoardInput = serde_json::from_str(
            r#"{ "projectId": "p", "name": "n", "columns": [
                { "name": "A", "kind": "todo" }, { "name": "B", "kind": "done" } ] }"#,
        )
        .expect("parses");

        assert_eq!(missing.columns, None);
        assert_eq!(empty.columns, Some(vec![]));
        assert_eq!(
            named.columns,
            Some(vec![
                NewColumn {
                    name: "A".into(),
                    kind: ColumnKind::Todo
                },
                NewColumn {
                    name: "B".into(),
                    kind: ColumnKind::Done
                },
            ])
        );
    }

    #[test]
    fn new_column_requires_a_valid_kind() {
        let missing: Result<NewColumn, _> = serde_json::from_str(r#"{ "name": "A" }"#);
        let unknown: Result<NewColumn, _> =
            serde_json::from_str(r#"{ "name": "A", "kind": "doing" }"#);

        assert!(missing.is_err());
        assert!(unknown.is_err());
    }

    #[test]
    fn column_inputs_treat_kind_as_optional() {
        let created: CreateColumnInput =
            serde_json::from_str(r#"{ "boardId": "b", "name": "x" }"#).expect("parses");
        let updated: UpdateColumnInput =
            serde_json::from_str(r#"{ "kind": "done" }"#).expect("parses");

        assert_eq!(created.kind, None);
        assert_eq!(updated.kind, Some(ColumnKind::Done));
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
