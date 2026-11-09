use serde::{Deserialize, Serialize};
use specta::Type;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ChecklistItem {
    pub id: String,
    pub task_id: String,
    pub text: String,
    pub is_done: bool,
    pub position: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct CreateChecklistItemInput {
    pub task_id: String,
    pub text: String,
}

#[derive(Debug, Clone, Default, Deserialize, Type)]
#[serde(rename_all = "camelCase", default)]
pub struct UpdateChecklistItemInput {
    pub text: Option<String>,
    pub is_done: Option<bool>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn item_serializes_with_camel_case_keys() {
        let item = ChecklistItem {
            id: "i1".into(),
            task_id: "t1".into(),
            text: "Buy milk".into(),
            is_done: true,
            position: "V".into(),
            created_at: "x".into(),
            updated_at: "x".into(),
        };

        let json = serde_json::to_value(&item).expect("serializes");

        assert_eq!(json["taskId"], "t1");
        assert_eq!(json["isDone"], true);
    }

    #[test]
    fn create_input_requires_task_and_text() {
        let ok: CreateChecklistItemInput =
            serde_json::from_str(r#"{ "taskId": "t", "text": "x" }"#).expect("parses");
        let missing: Result<CreateChecklistItemInput, _> =
            serde_json::from_str(r#"{ "text": "x" }"#);

        assert_eq!(ok.task_id, "t");
        assert!(missing.is_err());
    }

    #[test]
    fn update_input_fields_are_all_optional() {
        let empty: UpdateChecklistItemInput = serde_json::from_str("{}").expect("parses");
        let done: UpdateChecklistItemInput =
            serde_json::from_str(r#"{ "isDone": true }"#).expect("parses");

        assert_eq!((empty.text, empty.is_done), (None, None));
        assert_eq!(done.is_done, Some(true));
    }
}
