use serde::{Deserialize, Serialize};
use specta::Type;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct Attachment {
    pub id: String,
    pub task_id: String,
    pub file_name: String,
    pub mime_type: String,
    pub size_bytes: u32,
    pub created_at: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn attachment_serializes_with_camel_case_keys_and_hides_the_stored_name() {
        let attachment = Attachment {
            id: "a1".into(),
            task_id: "t1".into(),
            file_name: "spec.pdf".into(),
            mime_type: "application/pdf".into(),
            size_bytes: 2048,
            created_at: "x".into(),
        };

        let json = serde_json::to_value(&attachment).expect("serializes");

        assert_eq!(json["taskId"], "t1");
        assert_eq!(json["fileName"], "spec.pdf");
        assert_eq!(json["mimeType"], "application/pdf");
        assert_eq!(json["sizeBytes"], 2048);
        assert!(json.get("storedName").is_none());
    }
}
