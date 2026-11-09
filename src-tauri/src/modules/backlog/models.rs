use serde::{Deserialize, Serialize};
use specta::Type;

use crate::modules::tags::models::Tag;
use crate::modules::tasks::models::{Task, TaskPriority};

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "snake_case")]
pub enum BacklogSort {
    /// Project name, then the order the user arranged inside each project.
    #[default]
    Manual,
    /// Urgent first, then earliest due date.
    Priority,
    /// Earliest due date first, undated tasks last.
    DueDate,
    /// Newest first.
    Created,
    Title,
}

#[derive(Debug, Clone, Default, Deserialize, Type)]
#[serde(rename_all = "camelCase", default)]
pub struct ListBacklogInput {
    pub project_id: Option<String>,
    pub priority: Option<TaskPriority>,
    pub tag_id: Option<String>,
    pub search: Option<String>,
    pub sort: Option<BacklogSort>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct BacklogItem {
    pub task: Task,
    pub project_name: String,
    pub tags: Vec<Tag>,
    pub subtask_count: u32,
    pub subtasks_done: u32,
    pub checklist_count: u32,
    pub checklist_done: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct BacklogGroup {
    pub project_id: String,
    pub project_name: String,
    pub items: Vec<BacklogItem>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn input_defaults_to_no_filters_and_manual_order() {
        let input: ListBacklogInput = serde_json::from_str("{}").expect("parses");

        assert!(input.project_id.is_none());
        assert!(input.priority.is_none());
        assert!(input.tag_id.is_none());
        assert!(input.search.is_none());
        assert_eq!(input.sort.unwrap_or_default(), BacklogSort::Manual);
    }

    #[test]
    fn input_reads_every_filter_in_camel_case() {
        let input: ListBacklogInput = serde_json::from_str(
            r#"{ "projectId": "p", "priority": "high", "tagId": "g", "search": "x", "sort": "due_date" }"#,
        )
        .expect("parses");

        assert_eq!(input.project_id.as_deref(), Some("p"));
        assert_eq!(input.priority, Some(TaskPriority::High));
        assert_eq!(input.tag_id.as_deref(), Some("g"));
        assert_eq!(input.search.as_deref(), Some("x"));
        assert_eq!(input.sort, Some(BacklogSort::DueDate));
    }

    #[test]
    fn sort_names_are_snake_case() {
        for (sort, name) in [
            (BacklogSort::Manual, "manual"),
            (BacklogSort::Priority, "priority"),
            (BacklogSort::DueDate, "due_date"),
            (BacklogSort::Created, "created"),
            (BacklogSort::Title, "title"),
        ] {
            assert_eq!(serde_json::to_value(sort).expect("serializes"), name);
        }
    }

    #[test]
    fn an_unknown_sort_is_rejected() {
        let result: Result<ListBacklogInput, _> = serde_json::from_str(r#"{ "sort": "random" }"#);

        assert!(result.is_err());
    }
}
