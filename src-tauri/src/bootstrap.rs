use std::path::Path;

use crate::db::{connection, migrations};
use crate::error::AppResult;
use crate::modules::notes::vault_service;
use crate::modules::settings::service as settings_service;
use crate::state::AppState;

pub const DATABASE_FILE_NAME: &str = "orbit.db";
pub const ATTACHMENTS_DIRECTORY_NAME: &str = "attachments";

pub fn initialize_state(data_directory: &Path) -> AppResult<AppState> {
    std::fs::create_dir_all(data_directory)?;
    let mut database = connection::open(&data_directory.join(DATABASE_FILE_NAME))?;
    migrations::run(&mut database)?;
    let attachments_directory = data_directory.join(ATTACHMENTS_DIRECTORY_NAME);
    std::fs::create_dir_all(&attachments_directory)?;
    let state = AppState::new(database, None).with_attachments_directory(attachments_directory);
    settings_service::restore_vault_path(&state)?;
    reconcile_vault(&state);
    Ok(state)
}

fn reconcile_vault(state: &AppState) {
    if state.vault_path().is_none() {
        return;
    }
    match vault_service::reindex(state) {
        Ok(report) => log::info!("vault indexed: {report:?}"),
        Err(error) => log::warn!("could not index the vault at startup: {error}"),
    }
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
    fn creates_and_exposes_the_attachments_directory() {
        let directory = tempfile::tempdir().expect("temp dir");

        let state = initialize_state(directory.path()).expect("initializes");

        let expected = directory.path().join(ATTACHMENTS_DIRECTORY_NAME);
        assert_eq!(state.attachments_directory(), Some(expected.as_path()));
        assert!(expected.is_dir());
    }

    #[test]
    fn restores_vault_path_saved_in_a_previous_run() {
        let directory = tempfile::tempdir().expect("temp dir");
        let first_run = initialize_state(directory.path()).expect("initializes");
        let input = UpdateSettingsInput {
            vault_path: Some("saved-vault".into()),
            ..Default::default()
        };
        settings_service::save(&first_run, input).expect("updates");
        drop(first_run);

        let second_run = initialize_state(directory.path()).expect("initializes again");

        assert_eq!(second_run.vault_path(), Some(PathBuf::from("saved-vault")));
    }
}
