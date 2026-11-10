use std::path::{Path, PathBuf};
use std::thread::JoinHandle;

use rusqlite::{Connection, OpenFlags};

use super::models::{CheckState, DatabaseStatus};
use crate::modules::backup::service::{foreign_key_problems, integrity_problems};
use crate::shared::time;
use crate::state::AppState;

pub fn status(state: &AppState) -> DatabaseStatus {
    state.integrity_status()
}

fn failed() -> DatabaseStatus {
    DatabaseStatus {
        state: CheckState::Failed,
        integrity_issues: Vec::new(),
        foreign_key_violations: 0,
        checked_at: Some(time::now()),
    }
}

pub fn inspect(connection: &Connection) -> DatabaseStatus {
    let integrity = integrity_problems(connection);
    let violations = foreign_key_problems(connection);
    match (integrity, violations) {
        (Ok(issues), Ok(count)) => {
            let is_healthy = issues.is_empty() && count == 0;
            DatabaseStatus {
                state: if is_healthy {
                    CheckState::Healthy
                } else {
                    CheckState::Problems
                },
                integrity_issues: issues,
                foreign_key_violations: u32::try_from(count).unwrap_or(u32::MAX),
                checked_at: Some(time::now()),
            }
        }
        (Err(error), _) | (_, Err(error)) => {
            log::warn!("the database check could not run: {error}");
            failed()
        }
    }
}

pub fn inspect_file(path: &Path) -> DatabaseStatus {
    match Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY) {
        Ok(connection) => inspect(&connection),
        Err(error) => {
            log::warn!("could not open the database for checking: {error}");
            failed()
        }
    }
}

pub fn spawn_check(state: &AppState, database_path: PathBuf) -> JoinHandle<()> {
    let slot = state.integrity_slot();
    std::thread::spawn(move || {
        let result = inspect_file(&database_path);
        match result.state {
            CheckState::Healthy => log::info!("database check passed"),
            _ => log::warn!("database check found problems: {result:?}"),
        }
        let mut guard = slot.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        *guard = result;
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::bootstrap::{DATABASE_FILE_NAME, initialize_state};
    use crate::db::connection::open_in_memory;
    use crate::db::migrations;

    fn migrated() -> Connection {
        let mut connection = open_in_memory().expect("opens");
        migrations::run(&mut connection).expect("migrates");
        connection
    }

    fn insert_orphan_task(connection: &Connection) {
        connection
            .execute_batch("PRAGMA foreign_keys = OFF;")
            .expect("pragma");
        connection
            .execute(
                "INSERT INTO tasks (id, project_id, title, position, created_at, updated_at) VALUES ('t-orphan', 'ghost', 'T', 'V', 'x', 'x')",
                [],
            )
            .expect("inserts orphan");
    }

    #[test]
    fn a_fresh_database_is_healthy() {
        let connection = migrated();

        let result = inspect(&connection);

        assert_eq!(result.state, CheckState::Healthy);
        assert!(result.integrity_issues.is_empty());
        assert_eq!(result.foreign_key_violations, 0);
        assert!(result.checked_at.is_some());
    }

    #[test]
    fn broken_references_are_reported_as_problems() {
        let connection = migrated();
        insert_orphan_task(&connection);

        let result = inspect(&connection);

        assert_eq!(result.state, CheckState::Problems);
        assert_eq!(result.foreign_key_violations, 1);
        assert!(result.integrity_issues.is_empty());
    }

    #[test]
    fn a_missing_file_is_reported_as_failed() {
        let directory = tempfile::tempdir().expect("temp dir");

        let result = inspect_file(&directory.path().join("absent.db"));

        assert_eq!(result.state, CheckState::Failed);
        assert!(result.checked_at.is_some());
    }

    #[test]
    fn a_file_that_is_not_a_database_is_never_reported_healthy() {
        let directory = tempfile::tempdir().expect("temp dir");
        let path = directory.path().join("junk.db");
        std::fs::write(&path, vec![b'x'; 8192]).expect("writes");

        let result = inspect_file(&path);

        assert_ne!(result.state, CheckState::Healthy);
    }

    #[test]
    fn the_status_is_pending_until_the_check_finishes() {
        let state = AppState::new(open_in_memory().expect("opens"), None);

        assert_eq!(status(&state).state, CheckState::Pending);
    }

    #[test]
    fn the_background_check_publishes_its_result_to_the_state() {
        let data = tempfile::tempdir().expect("data dir");
        let state = initialize_state(data.path()).expect("starts");

        spawn_check(&state, data.path().join(DATABASE_FILE_NAME))
            .join()
            .expect("check thread finishes");

        let result = status(&state);
        assert_eq!(result.state, CheckState::Healthy);
        assert!(result.checked_at.is_some());
    }

    #[test]
    fn the_background_check_reports_a_damaged_database() {
        let data = tempfile::tempdir().expect("data dir");
        let state = initialize_state(data.path()).expect("starts");
        insert_orphan_task(&state.database());

        spawn_check(&state, data.path().join(DATABASE_FILE_NAME))
            .join()
            .expect("check thread finishes");

        let result = status(&state);
        assert_eq!(result.state, CheckState::Problems);
        assert_eq!(result.foreign_key_violations, 1);
    }

    #[test]
    fn the_check_does_not_wait_for_the_live_connection() {
        let data = tempfile::tempdir().expect("data dir");
        let state = initialize_state(data.path()).expect("starts");
        let guard = state.database();

        spawn_check(&state, data.path().join(DATABASE_FILE_NAME))
            .join()
            .expect("check finishes while the connection is held");
        drop(guard);

        assert_eq!(status(&state).state, CheckState::Healthy);
    }
}
