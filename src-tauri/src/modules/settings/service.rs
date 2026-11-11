use std::path::PathBuf;

use rusqlite::Connection;

use super::models::{
    KEY_LANGUAGE, KEY_USER_NAME, KEY_VAULT_PATH, Settings, USER_NAME_MAX_LENGTH,
    UpdateSettingsInput,
};
use super::repository;
use crate::error::{AppError, AppResult};
use crate::shared::{text, time};
use crate::state::AppState;

pub fn get(state: &AppState) -> AppResult<Settings> {
    let connection = state.database();
    load(&connection)
}

pub fn update(state: &AppState, input: UpdateSettingsInput) -> AppResult<Settings> {
    let tries_to_set_the_vault = input.vault_path.is_some();
    if tries_to_set_the_vault {
        return Err(AppError::Validation(
            "the vault is chosen with setupVault, not with updateSettings".into(),
        ));
    }
    save(state, input)
}

pub fn save(state: &AppState, input: UpdateSettingsInput) -> AppResult<Settings> {
    let vault_path = normalize_vault_path(input.vault_path)?;
    let user_name = normalize_user_name(input.user_name)?;
    let now = time::now();

    let settings = {
        let mut connection = state.database();
        let transaction = connection.transaction()?;
        match input.language {
            Some(Some(language)) => {
                repository::upsert(&transaction, KEY_LANGUAGE, language.as_str(), &now)?;
            }
            Some(None) => repository::delete(&transaction, KEY_LANGUAGE)?,
            None => {}
        }
        if let Some(path) = &vault_path {
            repository::upsert(&transaction, KEY_VAULT_PATH, path, &now)?;
        }
        match user_name {
            Some(Some(name)) => repository::upsert(&transaction, KEY_USER_NAME, &name, &now)?,
            Some(None) => repository::delete(&transaction, KEY_USER_NAME)?,
            None => {}
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

fn normalize_user_name(user_name: Option<Option<String>>) -> AppResult<Option<Option<String>>> {
    let Some(patch) = user_name else {
        return Ok(None);
    };
    let Some(name) = text::optional_text(patch) else {
        return Ok(Some(None));
    };
    let valid = text::require_text("user name", &name, USER_NAME_MAX_LENGTH)?;
    Ok(Some(Some(valid)))
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
            language: Some(Some(Language::PtBr)),
            ..Default::default()
        };

        let settings = update(&state, input).expect("updates");

        assert_eq!(settings.language, Some(Language::PtBr));
        assert_eq!(settings.vault_path, None);
        assert_eq!(get(&state).expect("reads"), settings);
    }

    #[test]
    fn fresh_database_follows_the_system_language() {
        let state = fresh_state();

        let settings = get(&state).expect("reads");

        assert_eq!(settings.language, None);
    }

    #[test]
    fn language_can_be_cleared_back_to_following_the_system() {
        let state = fresh_state();
        let choose = UpdateSettingsInput {
            language: Some(Some(Language::En)),
            ..Default::default()
        };
        update(&state, choose).expect("chooses");
        let clear = UpdateSettingsInput {
            language: Some(None),
            ..Default::default()
        };

        let settings = update(&state, clear).expect("clears");

        assert_eq!(settings.language, None);
        assert_eq!(get(&state).expect("reads").language, None);
    }

    #[test]
    fn clearing_the_language_keeps_the_vault_path() {
        let state = fresh_state();
        let setup = UpdateSettingsInput {
            language: Some(Some(Language::PtBr)),
            vault_path: Some("my-vault".into()),
            ..Default::default()
        };
        save(&state, setup).expect("sets both");
        let clear = UpdateSettingsInput {
            language: Some(None),
            ..Default::default()
        };

        let settings = save(&state, clear).expect("clears");

        assert_eq!(settings.vault_path.as_deref(), Some("my-vault"));
        assert_eq!(state.vault_path(), Some(PathBuf::from("my-vault")));
    }

    #[test]
    fn update_without_language_keeps_the_chosen_one() {
        let state = fresh_state();
        let choose = UpdateSettingsInput {
            language: Some(Some(Language::PtBr)),
            ..Default::default()
        };
        save(&state, choose).expect("chooses");
        let only_vault = UpdateSettingsInput {
            vault_path: Some("my-vault".into()),
            ..Default::default()
        };

        let settings = save(&state, only_vault).expect("updates vault");

        assert_eq!(settings.language, Some(Language::PtBr));
    }

    #[test]
    fn update_persists_every_field() {
        let state = fresh_state();
        let input = UpdateSettingsInput {
            language: Some(Some(Language::PtBr)),
            vault_path: Some("  my-vault  ".into()),
            ..Default::default()
        };

        save(&state, input).expect("updates");

        let settings = get(&state).expect("reads");
        assert_eq!(settings.language, Some(Language::PtBr));
        assert_eq!(settings.vault_path.as_deref(), Some("my-vault"));
    }

    #[test]
    fn update_refreshes_vault_path_in_state() {
        let state = fresh_state();
        let input = UpdateSettingsInput {
            vault_path: Some("my-vault".into()),
            ..Default::default()
        };

        save(&state, input).expect("updates");

        assert_eq!(state.vault_path(), Some(PathBuf::from("my-vault")));
    }

    #[test]
    fn rejects_blank_vault_path_without_changing_anything() {
        let state = fresh_state();
        let input = UpdateSettingsInput {
            language: Some(Some(Language::PtBr)),
            vault_path: Some("   ".into()),
            ..Default::default()
        };

        let result = save(&state, input);

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

    #[test]
    fn update_refuses_a_vault_path_and_points_to_setup_vault_without_changing_anything() {
        let state = fresh_state();
        let input = UpdateSettingsInput {
            language: Some(Some(Language::PtBr)),
            vault_path: Some("/some/vault".into()),
            ..Default::default()
        };

        let result = update(&state, input);

        let Err(AppError::Validation(message)) = result else {
            panic!("expected a validation error");
        };
        assert!(message.contains("setupVault"));
        assert_eq!(get(&state).expect("reads"), Settings::default());
        assert_eq!(state.vault_path(), None);
    }

    #[test]
    fn update_still_changes_the_language_and_keeps_an_existing_vault() {
        let state = fresh_state();
        save(
            &state,
            UpdateSettingsInput {
                vault_path: Some("my-vault".into()),
                ..Default::default()
            },
        )
        .expect("saves the vault");

        let settings = update(
            &state,
            UpdateSettingsInput {
                language: Some(Some(Language::PtBr)),
                ..Default::default()
            },
        )
        .expect("updates the language");

        assert_eq!(settings.language, Some(Language::PtBr));
        assert_eq!(settings.vault_path.as_deref(), Some("my-vault"));
        assert_eq!(state.vault_path(), Some(PathBuf::from("my-vault")));
    }

    fn name_patch(name: Option<&str>) -> UpdateSettingsInput {
        UpdateSettingsInput {
            user_name: Some(name.map(String::from)),
            ..Default::default()
        }
    }

    #[test]
    fn fresh_database_has_no_user_name() {
        let state = fresh_state();

        assert_eq!(get(&state).expect("reads").user_name, None);
    }

    #[test]
    fn user_name_is_trimmed_and_stored() {
        let state = fresh_state();

        let settings = update(&state, name_patch(Some("  Ana  "))).expect("sets the name");

        assert_eq!(settings.user_name.as_deref(), Some("Ana"));
        assert_eq!(
            get(&state).expect("reads").user_name.as_deref(),
            Some("Ana")
        );
    }

    #[test]
    fn blank_user_name_after_trim_clears_it() {
        let state = fresh_state();
        update(&state, name_patch(Some("Ana"))).expect("sets the name");

        let settings = update(&state, name_patch(Some("   "))).expect("clears");

        assert_eq!(settings.user_name, None);
        assert_eq!(get(&state).expect("reads").user_name, None);
    }

    #[test]
    fn null_user_name_clears_it() {
        let state = fresh_state();
        update(&state, name_patch(Some("Ana"))).expect("sets the name");

        let settings = update(&state, name_patch(None)).expect("clears");

        assert_eq!(settings.user_name, None);
    }

    #[test]
    fn absent_user_name_keeps_the_stored_one() {
        let state = fresh_state();
        update(&state, name_patch(Some("Ana"))).expect("sets the name");
        let language_only = UpdateSettingsInput {
            language: Some(Some(Language::En)),
            ..Default::default()
        };

        let settings = update(&state, language_only).expect("updates language");

        assert_eq!(settings.user_name.as_deref(), Some("Ana"));
    }

    #[test]
    fn user_name_accepts_exactly_the_maximum_length_in_characters() {
        let state = fresh_state();
        let name = "ç".repeat(USER_NAME_MAX_LENGTH);

        let settings = update(&state, name_patch(Some(&name))).expect("sets the name");

        assert_eq!(settings.user_name.as_deref(), Some(name.as_str()));
    }

    #[test]
    fn user_name_above_the_maximum_is_rejected_without_changing_anything() {
        let state = fresh_state();
        update(&state, name_patch(Some("Ana"))).expect("sets the name");
        let too_long = "a".repeat(USER_NAME_MAX_LENGTH + 1);
        let input = UpdateSettingsInput {
            language: Some(Some(Language::PtBr)),
            user_name: Some(Some(too_long)),
            ..Default::default()
        };

        let result = update(&state, input);

        assert!(matches!(result, Err(AppError::Validation(_))));
        let settings = get(&state).expect("reads");
        assert_eq!(settings.user_name.as_deref(), Some("Ana"));
        assert_eq!(settings.language, None);
    }

    #[test]
    fn user_name_does_not_touch_the_vault_path() {
        let state = fresh_state();
        save(
            &state,
            UpdateSettingsInput {
                vault_path: Some("my-vault".into()),
                ..Default::default()
            },
        )
        .expect("saves the vault");

        let settings = update(&state, name_patch(Some("Ana"))).expect("sets the name");

        assert_eq!(settings.vault_path.as_deref(), Some("my-vault"));
        assert_eq!(state.vault_path(), Some(PathBuf::from("my-vault")));
    }

    #[test]
    fn a_database_saved_before_the_user_name_existed_loads_with_no_name() {
        let state = fresh_state();
        {
            let connection = state.database();
            repository::upsert(&connection, KEY_LANGUAGE, "en", "2026-01-01T00:00:00.000Z")
                .expect("stores");
        }

        let settings = get(&state).expect("reads");

        assert_eq!(settings.language, Some(Language::En));
        assert_eq!(settings.user_name, None);
    }
}
