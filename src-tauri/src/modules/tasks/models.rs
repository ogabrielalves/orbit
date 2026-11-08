use serde::{Deserialize, Serialize};
use specta::Type;

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
}
