use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use specta::Type;

use super::index_service::{self, IndexReport};
use crate::error::{AppError, AppResult};
use crate::modules::settings::models::UpdateSettingsInput;
use crate::modules::settings::service as settings;
use crate::shared::id;
use crate::state::AppState;
use crate::vault::writer;

#[derive(Debug, Clone, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SetupVaultInput {
    pub path: String,
    #[serde(default)]
    pub create: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct VaultInfo {
    pub path: String,
    pub was_created: bool,
    pub note_count: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct VaultStatus {
    pub path: Option<String>,
    pub is_accessible: bool,
}

pub fn setup(state: &AppState, input: SetupVaultInput) -> AppResult<VaultInfo> {
    let path = parse_path(&input.path)?;
    let was_created = prepare_directory(&path, input.create)?;
    verify_access(&path)?;

    let path_text = path.to_string_lossy().into_owned();
    settings::save(
        state,
        UpdateSettingsInput {
            vault_path: Some(path_text.clone()),
            ..Default::default()
        },
    )?;
    let report = reindex(state)?;
    let note_count = report.added + report.updated + report.unchanged;
    Ok(VaultInfo {
        path: path_text,
        was_created,
        note_count,
    })
}

pub fn reindex(state: &AppState) -> AppResult<IndexReport> {
    let root = vault_root(state)?;
    let mut connection = state.database();
    index_service::reconcile(&mut connection, &root)
}

pub fn status(state: &AppState) -> VaultStatus {
    match state.vault_path() {
        Some(path) => VaultStatus {
            is_accessible: verify_access(&path).is_ok(),
            path: Some(path.to_string_lossy().into_owned()),
        },
        None => VaultStatus {
            path: None,
            is_accessible: false,
        },
    }
}

pub fn vault_root(state: &AppState) -> AppResult<PathBuf> {
    let path = state
        .vault_path()
        .ok_or_else(|| AppError::NotFound("vault".into()))?;
    verify_access(&path)?;
    Ok(path)
}

fn parse_path(text: &str) -> AppResult<PathBuf> {
    let trimmed = text.trim();
    let is_blank = trimmed.is_empty();
    if is_blank {
        return Err(AppError::Validation("vault path cannot be empty".into()));
    }
    let path = PathBuf::from(trimmed);
    let is_relative = !path.is_absolute();
    if is_relative {
        return Err(AppError::Validation(
            "vault path must be an absolute path".into(),
        ));
    }
    Ok(path)
}

fn prepare_directory(path: &Path, create: bool) -> AppResult<bool> {
    if path.exists() {
        let is_directory = path.is_dir();
        if !is_directory {
            return Err(AppError::Validation(
                "the vault path points to a file, not a directory".into(),
            ));
        }
        return Ok(false);
    }
    if !create {
        return Err(AppError::NotFound("vault directory".into()));
    }
    std::fs::create_dir_all(path)?;
    Ok(true)
}

fn verify_access(path: &Path) -> AppResult<()> {
    let is_directory = path.is_dir();
    if !is_directory {
        return Err(AppError::NotFound("vault directory".into()));
    }
    std::fs::read_dir(path).map_err(|error| {
        log::warn!("vault directory is not readable: {error}");
        AppError::Validation("the vault directory cannot be read".into())
    })?;

    let probe = path.join(format!(".orbit-access-check-{}", id::new_id()));
    let probe_result = writer::write_atomic(&probe, b"");
    if probe_result.is_err() {
        return Err(AppError::Validation(
            "the vault directory is not writable".into(),
        ));
    }
    if let Err(error) = std::fs::remove_file(&probe) {
        log::warn!("could not remove the access probe: {error}");
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{connection::open_in_memory, migrations};

    fn state() -> AppState {
        let mut connection = open_in_memory().expect("opens");
        migrations::run(&mut connection).expect("migrates");
        AppState::new(connection, None)
    }

    fn input(path: &Path, create: bool) -> SetupVaultInput {
        SetupVaultInput {
            path: path.to_string_lossy().into_owned(),
            create,
        }
    }

    fn entries(directory: &Path) -> Vec<String> {
        std::fs::read_dir(directory)
            .expect("reads dir")
            .map(|entry| {
                entry
                    .expect("entry")
                    .file_name()
                    .to_string_lossy()
                    .into_owned()
            })
            .collect()
    }

    #[test]
    fn an_existing_directory_becomes_the_vault_and_is_saved_in_the_settings() {
        let state = state();
        let directory = tempfile::tempdir().expect("temp dir");

        let info = setup(&state, input(directory.path(), false)).expect("sets up");

        assert!(!info.was_created);
        assert_eq!(state.vault_path().as_deref(), Some(directory.path()));
        let saved = settings::get(&state).expect("reads settings");
        assert_eq!(saved.vault_path.as_deref(), Some(info.path.as_str()));
    }

    #[test]
    fn a_missing_directory_is_created_only_when_asked() {
        let state = state();
        let directory = tempfile::tempdir().expect("temp dir");
        let nested = directory.path().join("notes").join("vault");

        let refused = setup(&state, input(&nested, false));
        let created = setup(&state, input(&nested, true)).expect("creates");

        assert!(matches!(refused, Err(AppError::NotFound(_))));
        assert!(created.was_created);
        assert!(nested.is_dir());
        assert_eq!(state.vault_path().as_deref(), Some(nested.as_path()));
    }

    #[test]
    fn a_failed_setup_keeps_the_previous_vault() {
        let state = state();
        let good = tempfile::tempdir().expect("temp dir");
        setup(&state, input(good.path(), false)).expect("sets up");
        let missing = good.path().join("ghost");

        let result = setup(&state, input(&missing, false));

        assert!(result.is_err());
        assert_eq!(state.vault_path().as_deref(), Some(good.path()));
        assert!(!missing.exists());
    }

    #[test]
    fn blank_relative_and_file_paths_are_rejected() {
        let state = state();
        let directory = tempfile::tempdir().expect("temp dir");
        let file = directory.path().join("file.txt");
        std::fs::write(&file, "x").expect("writes");

        let blank = setup(
            &state,
            SetupVaultInput {
                path: "   ".into(),
                create: true,
            },
        );
        let relative = setup(
            &state,
            SetupVaultInput {
                path: "some/relative".into(),
                create: true,
            },
        );
        let on_a_file = setup(&state, input(&file, true));

        assert!(matches!(blank, Err(AppError::Validation(_))));
        assert!(matches!(relative, Err(AppError::Validation(_))));
        assert!(matches!(on_a_file, Err(AppError::Validation(_))));
        assert_eq!(state.vault_path(), None);
    }

    #[test]
    fn the_access_check_leaves_nothing_behind_in_the_vault() {
        let state = state();
        let directory = tempfile::tempdir().expect("temp dir");
        std::fs::write(directory.path().join("existing.md"), "# Hi").expect("writes");

        setup(&state, input(directory.path(), false)).expect("sets up");

        assert_eq!(entries(directory.path()), ["existing.md"]);
    }

    #[test]
    fn the_path_is_trimmed_before_use() {
        let state = state();
        let directory = tempfile::tempdir().expect("temp dir");
        let padded = SetupVaultInput {
            path: format!("  {}  ", directory.path().display()),
            create: false,
        };

        setup(&state, padded).expect("sets up");

        assert_eq!(state.vault_path().as_deref(), Some(directory.path()));
    }

    #[test]
    fn the_vault_can_be_switched_to_another_directory() {
        let state = state();
        let first = tempfile::tempdir().expect("temp dir");
        let second = tempfile::tempdir().expect("temp dir");

        setup(&state, input(first.path(), false)).expect("sets up");
        setup(&state, input(second.path(), false)).expect("switches");

        assert_eq!(state.vault_path().as_deref(), Some(second.path()));
        let saved = settings::get(&state).expect("reads settings");
        assert_eq!(
            saved.vault_path.as_deref(),
            Some(second.path().to_string_lossy().as_ref())
        );
    }

    #[test]
    fn status_reports_no_vault_an_accessible_vault_and_a_vanished_one() {
        let state = state();
        let directory = tempfile::tempdir().expect("temp dir");
        let vault = directory.path().join("vault");

        let none = status(&state);
        setup(&state, input(&vault, true)).expect("sets up");
        let accessible = status(&state);
        std::fs::remove_dir_all(&vault).expect("removes vault");
        let vanished = status(&state);

        assert_eq!(
            none,
            VaultStatus {
                path: None,
                is_accessible: false
            }
        );
        assert!(accessible.is_accessible);
        assert_eq!(
            accessible.path.as_deref(),
            Some(vault.to_string_lossy().as_ref())
        );
        assert!(!vanished.is_accessible);
        assert!(vanished.path.is_some());
    }

    #[test]
    fn vault_root_requires_a_configured_and_still_existing_vault() {
        let state = state();
        let directory = tempfile::tempdir().expect("temp dir");
        let vault = directory.path().join("vault");

        let unconfigured = vault_root(&state);
        setup(&state, input(&vault, true)).expect("sets up");
        let ready = vault_root(&state).expect("resolves");
        std::fs::remove_dir_all(&vault).expect("removes vault");
        let gone = vault_root(&state);

        assert!(matches!(unconfigured, Err(AppError::NotFound(_))));
        assert_eq!(ready, vault);
        assert!(matches!(gone, Err(AppError::NotFound(_))));
    }

    #[test]
    fn unicode_directory_names_work() {
        let state = state();
        let directory = tempfile::tempdir().expect("temp dir");
        let vault = directory.path().join("Anotações — 日本");

        let info = setup(&state, input(&vault, true)).expect("sets up");

        assert!(vault.is_dir());
        assert_eq!(info.path, vault.to_string_lossy());
    }
}
