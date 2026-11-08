use serde::{Deserialize, Serialize};
use specta::Type;

use crate::shared::patch::distinguish_null_from_absent;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "lowercase")]
pub enum TaskPriority {
    Low,
    Medium,
    High,
    Urgent,
}

impl TaskPriority {
    pub const ALL: [Self; 4] = [Self::Low, Self::Medium, Self::High, Self::Urgent];

    pub fn as_str(self) -> &'static str {
        match self {
            Self::Low => "low",
            Self::Medium => "medium",
            Self::High => "high",
            Self::Urgent => "urgent",
        }
    }

    pub fn parse(value: &str) -> Option<Self> {
        Self::ALL
            .into_iter()
            .find(|priority| priority.as_str() == value)
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct Task {
    pub id: String,
    pub project_id: String,
    pub board_id: Option<String>,
    pub column_id: Option<String>,
    pub parent_task_id: Option<String>,
    pub title: String,
    pub description: String,
    pub priority: TaskPriority,
    pub due_date: Option<String>,
    pub position: String,
    pub created_at: String,
    pub updated_at: String,
    pub completed_at: Option<String>,
    pub archived_at: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct CreateTaskInput {
    pub project_id: String,
    pub title: String,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub priority: Option<TaskPriority>,
    #[serde(default)]
    pub due_date: Option<String>,
    #[serde(default)]
    pub column_id: Option<String>,
}

#[derive(Debug, Clone, Default, Deserialize, Type)]
#[serde(rename_all = "camelCase", default)]
pub struct UpdateTaskInput {
    pub title: Option<String>,
    pub description: Option<String>,
    pub priority: Option<TaskPriority>,
    #[serde(deserialize_with = "distinguish_null_from_absent")]
    #[specta(type = Option<String>)]
    pub due_date: Option<Option<String>>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn priority_round_trips_through_its_text_form() {
        for priority in TaskPriority::ALL {
            assert_eq!(TaskPriority::parse(priority.as_str()), Some(priority));
        }
        assert_eq!(TaskPriority::parse("critical"), None);
    }

    #[test]
    fn priority_serde_names_match_the_database_values() {
        for priority in TaskPriority::ALL {
            let json = serde_json::to_value(priority).expect("serializes");
            assert_eq!(json, priority.as_str());
        }
    }

    #[test]
    fn every_priority_is_accepted_by_the_tasks_table() {
        let mut connection = crate::db::connection::open_in_memory().expect("opens");
        crate::db::migrations::run(&mut connection).expect("migrates");
        connection
            .execute(
                "INSERT INTO projects (id, name, created_at, updated_at) VALUES ('p1', 'P', 'x', 'x')",
                [],
            )
            .expect("project");

        for (index, priority) in TaskPriority::ALL.into_iter().enumerate() {
            let result = connection.execute(
                "INSERT INTO tasks (id, project_id, title, priority, position, created_at, updated_at) VALUES (?1, 'p1', 'T', ?2, 'V', 'x', 'x')",
                (format!("t{index}"), priority.as_str()),
            );
            assert!(result.is_ok(), "{priority:?} should be accepted");
        }
    }

    #[test]
    fn create_input_only_requires_project_and_title() {
        let input: CreateTaskInput =
            serde_json::from_str(r#"{ "projectId": "p1", "title": "Write docs" }"#)
                .expect("parses");

        assert_eq!(input.project_id, "p1");
        assert_eq!(input.priority, None);
        assert_eq!(input.column_id, None);
    }

    #[test]
    fn create_input_reads_every_optional_field() {
        let input: CreateTaskInput = serde_json::from_str(
            r#"{ "projectId": "p", "title": "t", "description": "d", "priority": "urgent", "dueDate": "2026-11-08", "columnId": "c" }"#,
        )
        .expect("parses");

        assert_eq!(input.priority, Some(TaskPriority::Urgent));
        assert_eq!(input.due_date.as_deref(), Some("2026-11-08"));
        assert_eq!(input.column_id.as_deref(), Some("c"));
    }

    #[test]
    fn update_input_tells_a_cleared_due_date_from_an_untouched_one() {
        let cleared: UpdateTaskInput =
            serde_json::from_str(r#"{ "dueDate": null }"#).expect("parses");
        let untouched: UpdateTaskInput =
            serde_json::from_str(r#"{ "title": "x" }"#).expect("parses");
        let set: UpdateTaskInput =
            serde_json::from_str(r#"{ "dueDate": "2026-11-08" }"#).expect("parses");

        assert_eq!(cleared.due_date, Some(None));
        assert_eq!(untouched.due_date, None);
        assert_eq!(set.due_date, Some(Some("2026-11-08".to_string())));
    }

    #[test]
    fn task_serializes_with_camel_case_keys_and_null_options() {
        let task = Task {
            id: "t1".into(),
            project_id: "p1".into(),
            board_id: None,
            column_id: None,
            parent_task_id: None,
            title: "T".into(),
            description: String::new(),
            priority: TaskPriority::High,
            due_date: None,
            position: "V".into(),
            created_at: "x".into(),
            updated_at: "x".into(),
            completed_at: None,
            archived_at: None,
        };

        let json = serde_json::to_value(&task).expect("serializes");

        assert_eq!(json["projectId"], "p1");
        assert_eq!(json["priority"], "high");
        assert_eq!(json["boardId"], serde_json::Value::Null);
        assert_eq!(json["parentTaskId"], serde_json::Value::Null);
    }
}
