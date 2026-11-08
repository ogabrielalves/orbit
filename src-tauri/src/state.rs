use std::path::{Path, PathBuf};
use std::sync::{Mutex, MutexGuard, PoisonError};

use rusqlite::Connection;

pub struct AppState {
    database: Mutex<Connection>,
    vault_path: Mutex<Option<PathBuf>>,
    attachments_directory: Option<PathBuf>,
}

impl AppState {
    pub fn new(connection: Connection, vault_path: Option<PathBuf>) -> Self {
        Self {
            database: Mutex::new(connection),
            vault_path: Mutex::new(vault_path),
            attachments_directory: None,
        }
    }

    pub fn with_attachments_directory(mut self, directory: PathBuf) -> Self {
        self.attachments_directory = Some(directory);
        self
    }

    pub fn attachments_directory(&self) -> Option<&Path> {
        self.attachments_directory.as_deref()
    }

    pub fn database(&self) -> MutexGuard<'_, Connection> {
        self.database.lock().unwrap_or_else(PoisonError::into_inner)
    }

    pub fn vault_path(&self) -> Option<PathBuf> {
        let guard = self
            .vault_path
            .lock()
            .unwrap_or_else(PoisonError::into_inner);
        guard.clone()
    }

    pub fn set_vault_path(&self, path: Option<PathBuf>) {
        let mut guard = self
            .vault_path
            .lock()
            .unwrap_or_else(PoisonError::into_inner);
        *guard = path;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::connection::open_in_memory;

    fn state_without_vault() -> AppState {
        AppState::new(open_in_memory().expect("opens"), None)
    }

    #[test]
    fn has_no_attachments_directory_until_one_is_set() {
        let state = state_without_vault();

        assert_eq!(state.attachments_directory(), None);
    }

    #[test]
    fn exposes_the_configured_attachments_directory() {
        let state = state_without_vault().with_attachments_directory(PathBuf::from("files"));

        assert_eq!(state.attachments_directory(), Some(Path::new("files")));
    }

    #[test]
    fn starts_without_vault_path() {
        let state = state_without_vault();

        assert_eq!(state.vault_path(), None);
    }

    #[test]
    fn stores_updated_vault_path() {
        let state = state_without_vault();

        state.set_vault_path(Some(PathBuf::from("vault")));

        assert_eq!(state.vault_path(), Some(PathBuf::from("vault")));
    }

    #[test]
    fn exposes_working_connection() {
        let state = state_without_vault();

        let value: i64 = state
            .database()
            .query_row("SELECT 1", [], |row| row.get(0))
            .expect("query runs");

        assert_eq!(value, 1);
    }

    #[test]
    fn recovers_connection_after_poisoning() {
        let state = std::sync::Arc::new(state_without_vault());
        let poisoner = state.clone();
        let _ = std::thread::spawn(move || {
            let _guard = poisoner.database();
            panic!("poison the lock");
        })
        .join();

        let value: i64 = state
            .database()
            .query_row("SELECT 2", [], |row| row.get(0))
            .expect("query runs");

        assert_eq!(value, 2);
    }
}
