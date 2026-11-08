use serde::{Deserialize, Serialize};
use specta::Type;

use crate::shared::patch::distinguish_null_from_absent;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "lowercase")]
pub enum ProjectStatus {
    Active,
    Paused,
    Completed,
}

impl ProjectStatus {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Active => "active",
            Self::Paused => "paused",
            Self::Completed => "completed",
        }
    }

    pub fn parse(value: &str) -> Option<Self> {
        match value {
            "active" => Some(Self::Active),
            "paused" => Some(Self::Paused),
            "completed" => Some(Self::Completed),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub id: String,
    pub name: String,
    pub description: String,
    pub icon: Option<String>,
    pub color: Option<String>,
    pub status: ProjectStatus,
    pub created_at: String,
    pub updated_at: String,
    pub archived_at: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct CreateProjectInput {
    pub name: String,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub icon: Option<String>,
    #[serde(default)]
    pub color: Option<String>,
}

#[derive(Debug, Clone, Default, Deserialize, Type)]
#[serde(rename_all = "camelCase", default)]
pub struct UpdateProjectInput {
    pub name: Option<String>,
    pub description: Option<String>,
    #[serde(deserialize_with = "distinguish_null_from_absent")]
    #[specta(type = Option<String>)]
    pub icon: Option<Option<String>>,
    #[serde(deserialize_with = "distinguish_null_from_absent")]
    #[specta(type = Option<String>)]
    pub color: Option<Option<String>>,
    pub status: Option<ProjectStatus>,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "lowercase")]
pub enum ProjectScope {
    #[default]
    Active,
    Archived,
    All,
}

impl ProjectScope {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Active => "active",
            Self::Archived => "archived",
            Self::All => "all",
        }
    }
}

#[derive(Debug, Clone, Default, Deserialize, Type)]
#[serde(rename_all = "camelCase", default)]
pub struct ListProjectsInput {
    pub scope: ProjectScope,
    pub status: Option<ProjectStatus>,
    pub search: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ProjectBoard {
    pub id: String,
    pub name: String,
    pub created_at: String,
    pub task_count: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ProjectDetails {
    pub project: Project,
    pub boards: Vec<ProjectBoard>,
    pub task_count: u32,
    pub backlog_task_count: u32,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn status_round_trips_through_its_text_form() {
        for status in [
            ProjectStatus::Active,
            ProjectStatus::Paused,
            ProjectStatus::Completed,
        ] {
            assert_eq!(ProjectStatus::parse(status.as_str()), Some(status));
        }
    }

    #[test]
    fn status_rejects_unknown_text() {
        assert_eq!(ProjectStatus::parse("archived"), None);
    }

    #[test]
    fn project_serializes_with_camel_case_keys() {
        let project = Project {
            id: "p1".into(),
            name: "ORBIT".into(),
            description: String::new(),
            icon: None,
            color: Some("#fff".into()),
            status: ProjectStatus::Paused,
            created_at: "2026-11-08T10:00:00.000Z".into(),
            updated_at: "2026-11-08T10:00:00.000Z".into(),
            archived_at: None,
        };

        let json = serde_json::to_value(&project).expect("serializes");

        assert_eq!(json["status"], "paused");
        assert_eq!(json["createdAt"], "2026-11-08T10:00:00.000Z");
        assert_eq!(json["archivedAt"], serde_json::Value::Null);
    }

    #[test]
    fn create_input_only_requires_a_name() {
        let input: CreateProjectInput =
            serde_json::from_str(r#"{ "name": "ORBIT" }"#).expect("deserializes");

        assert_eq!(input.name, "ORBIT");
        assert_eq!(input.description, None);
        assert_eq!(input.icon, None);
    }

    #[test]
    fn create_input_without_a_name_is_rejected() {
        let result: Result<CreateProjectInput, _> = serde_json::from_str("{}");

        assert!(result.is_err());
    }

    #[test]
    fn update_input_tells_cleared_icon_from_untouched_icon() {
        let cleared: UpdateProjectInput =
            serde_json::from_str(r#"{ "icon": null }"#).expect("deserializes");
        let untouched: UpdateProjectInput =
            serde_json::from_str(r#"{ "name": "New" }"#).expect("deserializes");

        assert_eq!(cleared.icon, Some(None));
        assert_eq!(untouched.icon, None);
        assert_eq!(untouched.color, None);
    }

    #[test]
    fn list_input_defaults_to_active_scope_without_filters() {
        let input: ListProjectsInput = serde_json::from_str("{}").expect("deserializes");

        assert_eq!(input.scope, ProjectScope::Active);
        assert_eq!(input.status, None);
        assert_eq!(input.search, None);
    }
}
