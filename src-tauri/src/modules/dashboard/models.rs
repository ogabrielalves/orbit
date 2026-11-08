use serde::{Deserialize, Serialize};
use specta::Type;

use crate::modules::tasks::models::TaskPriority;

#[derive(Debug, Clone, Default, Deserialize, Type)]
#[serde(rename_all = "camelCase", default)]
pub struct DashboardSummaryInput {
    pub today: Option<String>,
    pub upcoming_days: Option<u32>,
    pub upcoming_limit: Option<u32>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct TaskStateCounts {
    pub total: u32,
    pub backlog: u32,
    pub pending: u32,
    pub in_progress: u32,
    pub completed: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct UpcomingTask {
    pub task_id: String,
    pub title: String,
    pub due_date: String,
    pub priority: TaskPriority,
    pub project_id: String,
    pub project_name: String,
    pub board_id: Option<String>,
    pub column_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct DashboardSummary {
    pub tasks: TaskStateCounts,
    pub active_project_count: u32,
    pub overdue_task_count: u32,
    pub upcoming_tasks: Vec<UpcomingTask>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn input_defaults_to_nothing_set() {
        let input: DashboardSummaryInput = serde_json::from_str("{}").expect("parses");

        assert_eq!(input.today, None);
        assert_eq!(input.upcoming_days, None);
        assert_eq!(input.upcoming_limit, None);
    }

    #[test]
    fn input_reads_camel_case_fields() {
        let input: DashboardSummaryInput = serde_json::from_str(
            r#"{ "today": "2026-11-08", "upcomingDays": 14, "upcomingLimit": 5 }"#,
        )
        .expect("parses");

        assert_eq!(input.today.as_deref(), Some("2026-11-08"));
        assert_eq!(input.upcoming_days, Some(14));
        assert_eq!(input.upcoming_limit, Some(5));
    }

    #[test]
    fn summary_serializes_with_camel_case_keys() {
        let summary = DashboardSummary {
            tasks: TaskStateCounts::default(),
            active_project_count: 2,
            overdue_task_count: 1,
            upcoming_tasks: vec![],
        };

        let json = serde_json::to_value(&summary).expect("serializes");

        assert_eq!(json["activeProjectCount"], 2);
        assert_eq!(json["overdueTaskCount"], 1);
        assert_eq!(json["tasks"]["inProgress"], 0);
        assert_eq!(json["upcomingTasks"], serde_json::json!([]));
    }
}
