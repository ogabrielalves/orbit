use std::path::Path;

use crate::db::{connection, migrations};
use crate::error::AppResult;
use crate::modules::settings::service as settings_service;
use crate::state::AppState;

pub const DATABASE_FILE_NAME: &str = "orbit.db";

pub fn initialize_state(data_directory: &Path) -> AppResult<AppState> {
    std::fs::create_dir_all(data_directory)?;
    let mut database = connection::open(&data_directory.join(DATABASE_FILE_NAME))?;
    migrations::run(&mut database)?;
    let state = AppState::new(database, None);
    settings_service::restore_vault_path(&state)?;
    Ok(state)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::modules::settings::models::UpdateSettingsInput;
    use std::path::PathBuf;

    #[test]
    fn creates_database_file_inside_data_directory() {
        let directory = tempfile::tempdir().expect("temp dir");
        let data_directory = directory.path().join("nested").join("data");

        initialize_state(&data_directory).expect("initializes");

        assert!(data_directory.join(DATABASE_FILE_NAME).is_file());
    }

    #[test]
    fn restores_vault_path_saved_in_a_previous_run() {
        let directory = tempfile::tempdir().expect("temp dir");
        let first_run = initialize_state(directory.path()).expect("initializes");
        let input = UpdateSettingsInput {
            vault_path: Some("saved-vault".into()),
            ..Default::default()
        };
        settings_service::update(&first_run, input).expect("updates");
        drop(first_run);

        let second_run = initialize_state(directory.path()).expect("initializes again");

        assert_eq!(second_run.vault_path(), Some(PathBuf::from("saved-vault")));
    }
}
