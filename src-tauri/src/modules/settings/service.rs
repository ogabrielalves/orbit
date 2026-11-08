use std::path::PathBuf;

use rusqlite::Connection;

use super::models::{KEY_LANGUAGE, KEY_VAULT_PATH, Settings, UpdateSettingsInput};
use super::repository;
use crate::error::{AppError, AppResult};
use crate::shared::time;
use crate::state::AppState;

pub fn get(state: &AppState) -> AppResult<Settings> {
    let connection = state.database();
    load(&connection)
}

pub fn update(state: &AppState, input: UpdateSettingsInput) -> AppResult<Settings> {
    let vault_path = normalize_vault_path(input.vault_path)?;
    let now = time::now();

    let settings = {
        let mut connection = state.database();
        let transaction = connection.transaction()?;
        if let Some(language) = input.language {
            repository::upsert(&transaction, KEY_LANGUAGE, language.as_str(), &now)?;
        }
        if let Some(path) = &vault_path {
            repository::upsert(&transaction, KEY_VAULT_PATH, path, &now)?;
        }
        transaction.commit()?;
        load(&connection)?
    };

    state.set_vault_path(settings.vault_path.clone().map(PathBuf::from));
    Ok(settings)
}

pub fn restore_vault_path(state: &AppState) -> AppResult<()> {
    let settings = get(state)?;
    state.set_vault_path(settings.vault_path.map(PathBuf::from));
    Ok(())
}

fn load(connection: &Connection) -> AppResult<Settings> {
    let stored = repository::find_all(connection)?;
    Ok(Settings::from_stored(&stored))
}

fn normalize_vault_path(vault_path: Option<String>) -> AppResult<Option<String>> {
    let Some(path) = vault_path else {
        return Ok(None);
    };
    let trimmed = path.trim();
    let is_blank = trimmed.is_empty();
    if is_blank {
        return Err(AppError::Validation("vault path cannot be empty".into()));
    }
    Ok(Some(trimmed.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{connection::open_in_memory, migrations};
    use crate::modules::settings::models::Language;

    fn fresh_state() -> AppState {
        let mut connection = open_in_memory().expect("opens");
        migrations::run(&mut connection).expect("migrates");
        AppState::new(connection, None)
    }

    #[test]
    fn returns_defaults_on_fresh_database() {
        let state = fresh_state();

        let settings = get(&state).expect("reads");

        assert_eq!(settings, Settings::default());
    }

    #[test]
    fn partial_update_changes_only_given_fields() {
        let state = fresh_state();
        let input = UpdateSettingsInput {
            language: Some(Language::PtBr),
            ..Default::default()
        };

        let settings = update(&state, input).expect("updates");

        assert_eq!(settings.language, Language::PtBr);
        assert_eq!(settings.vault_path, None);
        assert_eq!(get(&state).expect("reads"), settings);
    }

    #[test]
    fn update_persists_every_field() {
        let state = fresh_state();
        let input = UpdateSettingsInput {
            language: Some(Language::PtBr),
            vault_path: Some("  my-vault  ".into()),
        };

        update(&state, input).expect("updates");

        let settings = get(&state).expect("reads");
        assert_eq!(settings.language, Language::PtBr);
        assert_eq!(settings.vault_path.as_deref(), Some("my-vault"));
    }

    #[test]
    fn update_refreshes_vault_path_in_state() {
        let state = fresh_state();
        let input = UpdateSettingsInput {
            vault_path: Some("my-vault".into()),
            ..Default::default()
        };

        update(&state, input).expect("updates");

        assert_eq!(state.vault_path(), Some(PathBuf::from("my-vault")));
    }

    #[test]
    fn rejects_blank_vault_path_without_changing_anything() {
        let state = fresh_state();
        let input = UpdateSettingsInput {
            language: Some(Language::PtBr),
            vault_path: Some("   ".into()),
        };

        let result = update(&state, input);

        assert!(matches!(result, Err(AppError::Validation(_))));
        assert_eq!(get(&state).expect("reads"), Settings::default());
    }

    #[test]
    fn restore_vault_path_loads_stored_value_into_state() {
        let state = fresh_state();
        {
            let connection = state.database();
            repository::upsert(
                &connection,
                KEY_VAULT_PATH,
                "stored-vault",
                "2026-01-01T00:00:00.000Z",
            )
            .expect("stores");
        }

        restore_vault_path(&state).expect("restores");

        assert_eq!(state.vault_path(), Some(PathBuf::from("stored-vault")));
    }
}
