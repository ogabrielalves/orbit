use serde::{Deserialize, Serialize};
use specta::Type;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum CheckState {
    Pending,
    Healthy,
    Problems,
    Failed,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct DatabaseStatus {
    pub state: CheckState,
    pub integrity_issues: Vec<String>,
    pub foreign_key_violations: u32,
    pub checked_at: Option<String>,
}

impl DatabaseStatus {
    pub fn pending() -> Self {
        Self {
            state: CheckState::Pending,
            integrity_issues: Vec::new(),
            foreign_key_violations: 0,
            checked_at: None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn starts_pending_with_nothing_reported() {
        let status = DatabaseStatus::pending();

        assert_eq!(status.state, CheckState::Pending);
        assert!(status.integrity_issues.is_empty());
        assert_eq!(status.foreign_key_violations, 0);
        assert_eq!(status.checked_at, None);
    }

    #[test]
    fn serializes_with_camel_case_keys_and_states() {
        let status = DatabaseStatus {
            state: CheckState::Problems,
            integrity_issues: vec!["bad page".into()],
            foreign_key_violations: 2,
            checked_at: Some("2026-11-10T10:00:00.000Z".into()),
        };

        let value = serde_json::to_value(&status).expect("serializes");

        assert_eq!(value["state"], "problems");
        assert_eq!(value["integrityIssues"][0], "bad page");
        assert_eq!(value["foreignKeyViolations"], 2);
        assert_eq!(value["checkedAt"], "2026-11-10T10:00:00.000Z");
    }

    #[test]
    fn every_state_has_a_distinct_name() {
        let names: Vec<String> = [
            CheckState::Pending,
            CheckState::Healthy,
            CheckState::Problems,
            CheckState::Failed,
        ]
        .iter()
        .map(|state| serde_json::to_string(state).expect("serializes"))
        .collect();

        let mut unique = names.clone();
        unique.sort();
        unique.dedup();

        assert_eq!(unique.len(), names.len());
    }
}
