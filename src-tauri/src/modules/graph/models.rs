use serde::{Deserialize, Serialize};
use specta::Type;

pub const DEFAULT_DEPTH: u32 = 1;
pub const MAX_DEPTH: u32 = 5;
pub const UNRESOLVED_PREFIX: &str = "unresolved:";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "snake_case")]
pub enum GraphNodeKind {
    Note,
    Unresolved,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct GraphNode {
    pub id: String,
    pub kind: GraphNodeKind,
    pub title: String,
    pub path: Option<String>,
    pub degree: u32,
    pub distance: Option<u32>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct GraphEdge {
    pub source: String,
    pub target: String,
    pub weight: u32,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct Graph {
    pub nodes: Vec<GraphNode>,
    pub edges: Vec<GraphEdge>,
}

#[derive(Debug, Clone, Default, Deserialize, Type)]
#[serde(rename_all = "camelCase", default)]
pub struct GraphInput {
    pub include_unresolved: bool,
}

#[derive(Debug, Clone, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct LocalGraphInput {
    pub note_id: String,
    #[serde(default)]
    pub depth: Option<u32>,
    #[serde(default)]
    pub include_unresolved: bool,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn graph_types_serialize_with_camel_case_keys() {
        let graph = Graph {
            nodes: vec![GraphNode {
                id: "n1".into(),
                kind: GraphNodeKind::Note,
                title: "A".into(),
                path: Some("a.md".into()),
                degree: 2,
                distance: Some(0),
            }],
            edges: vec![GraphEdge {
                source: "n1".into(),
                target: "n2".into(),
                weight: 3,
            }],
        };

        let json = serde_json::to_value(&graph).expect("serializes");

        assert_eq!(json["nodes"][0]["kind"], "note");
        assert_eq!(json["nodes"][0]["degree"], 2);
        assert_eq!(json["nodes"][0]["distance"], 0);
        assert_eq!(json["edges"][0]["weight"], 3);
        assert_eq!(
            serde_json::to_value(GraphNodeKind::Unresolved).expect("serializes"),
            "unresolved"
        );
    }

    #[test]
    fn inputs_have_sensible_defaults() {
        let full: GraphInput = serde_json::from_str("{}").expect("parses");
        let local: LocalGraphInput = serde_json::from_str(r#"{ "noteId": "n1" }"#).expect("parses");
        let deep: LocalGraphInput =
            serde_json::from_str(r#"{ "noteId": "n1", "depth": 3, "includeUnresolved": true }"#)
                .expect("parses");
        let missing: Result<LocalGraphInput, _> = serde_json::from_str("{}");

        assert!(!full.include_unresolved);
        assert_eq!((local.depth, local.include_unresolved), (None, false));
        assert_eq!((deep.depth, deep.include_unresolved), (Some(3), true));
        assert!(missing.is_err());
    }
}
