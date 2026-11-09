use serde::{Deserialize, Serialize};
use specta::Type;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct Comment {
    pub id: String,
    pub task_id: String,
    pub body: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct CreateCommentInput {
    pub task_id: String,
    pub body: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn comment_serializes_with_camel_case_keys() {
        let comment = Comment {
            id: "c1".into(),
            task_id: "t1".into(),
            body: "Hello".into(),
            created_at: "x".into(),
            updated_at: "y".into(),
        };

        let json = serde_json::to_value(&comment).expect("serializes");

        assert_eq!(json["taskId"], "t1");
        assert_eq!(json["createdAt"], "x");
        assert_eq!(json["updatedAt"], "y");
    }

    #[test]
    fn create_input_requires_task_and_body() {
        let ok: CreateCommentInput =
            serde_json::from_str(r#"{ "taskId": "t", "body": "b" }"#).expect("parses");
        let missing: Result<CreateCommentInput, _> = serde_json::from_str(r#"{ "body": "b" }"#);

        assert_eq!(ok.body, "b");
        assert!(missing.is_err());
    }
}
