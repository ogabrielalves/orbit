use serde::{Deserialize, Serialize};
use specta::Type;

use crate::shared::patch::distinguish_null_from_absent;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct Tag {
    pub id: String,
    pub name: String,
    pub color: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub task_count: u32,
}

#[derive(Debug, Clone, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct CreateTagInput {
    pub name: String,
    #[serde(default)]
    pub color: Option<String>,
}

#[derive(Debug, Clone, Default, Deserialize, Type)]
#[serde(rename_all = "camelCase", default)]
pub struct UpdateTagInput {
    pub name: Option<String>,
    #[serde(deserialize_with = "distinguish_null_from_absent")]
    #[specta(type = Option<String>)]
    pub color: Option<Option<String>>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tag_serializes_with_camel_case_keys() {
        let tag = Tag {
            id: "g1".into(),
            name: "bug".into(),
            color: None,
            created_at: "x".into(),
            updated_at: "x".into(),
            task_count: 3,
        };

        let json = serde_json::to_value(&tag).expect("serializes");

        assert_eq!(json["taskCount"], 3);
        assert_eq!(json["color"], serde_json::Value::Null);
    }

    #[test]
    fn create_input_only_requires_a_name() {
        let input: CreateTagInput = serde_json::from_str(r#"{ "name": "bug" }"#).expect("parses");
        let missing: Result<CreateTagInput, _> = serde_json::from_str(r##"{ "color": "#fff" }"##);

        assert_eq!(input.color, None);
        assert!(missing.is_err());
    }

    #[test]
    fn update_input_tells_a_cleared_color_from_an_untouched_one() {
        let cleared: UpdateTagInput = serde_json::from_str(r#"{ "color": null }"#).expect("parses");
        let untouched: UpdateTagInput = serde_json::from_str(r#"{ "name": "x" }"#).expect("parses");

        assert_eq!(cleared.color, Some(None));
        assert_eq!(untouched.color, None);
    }
}
