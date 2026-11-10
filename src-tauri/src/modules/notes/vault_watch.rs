use std::sync::{Mutex, PoisonError};

use serde::{Deserialize, Serialize};
use specta::Type;
use tauri::{AppHandle, Manager};
use tauri_specta::Event;

use super::index_service;
use crate::error::AppResult;
use crate::state::AppState;
use crate::vault::watcher::{ChangeBatch, DEFAULT_DEBOUNCE, VaultWatcher};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type, Event)]
#[serde(rename_all = "camelCase")]
pub struct VaultChanged {
    pub added: u32,
    pub updated: u32,
    pub removed: u32,
}

#[derive(Default)]
pub struct VaultWatchSlot(Mutex<Option<VaultWatcher>>);

pub fn apply_batch(state: &AppState, batch: &ChangeBatch) -> AppResult<Option<VaultChanged>> {
    let Some(root) = state.vault_path() else {
        return Ok(None);
    };
    let report = {
        let mut connection = state.database();
        index_service::apply_changes(&mut connection, &root, batch)?
    };
    let did_change = report.added + report.updated + report.removed + report.ids_assigned > 0;
    Ok(did_change.then_some(VaultChanged {
        added: report.added,
        updated: report.updated,
        removed: report.removed,
    }))
}

pub fn restart(app: &AppHandle) {
    let slot = app.state::<VaultWatchSlot>();
    let mut guard = slot.0.lock().unwrap_or_else(PoisonError::into_inner);
    *guard = None;

    let state = app.state::<AppState>();
    let Some(root) = state.vault_path() else {
        return;
    };
    let handle = app.clone();
    let started = VaultWatcher::start(root, DEFAULT_DEBOUNCE, move |batch| {
        let state = handle.state::<AppState>();
        match apply_batch(&state, &batch) {
            Ok(Some(changed)) => {
                if let Err(error) = changed.emit(&handle) {
                    log::warn!("could not announce the vault change: {error}");
                }
            }
            Ok(None) => {}
            Err(error) => log::warn!("could not apply vault changes: {error}"),
        }
    });
    match started {
        Ok(watching) => *guard = Some(watching),
        Err(error) => log::warn!("the vault is not being watched: {error}"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{connection::open_in_memory, migrations};
    use crate::modules::notes::vault_service::{SetupVaultInput, setup};
    use std::fs;

    fn state_with_vault() -> (AppState, tempfile::TempDir) {
        let mut connection = open_in_memory().expect("opens");
        migrations::run(&mut connection).expect("migrates");
        let state = AppState::new(connection, None);
        let vault = tempfile::tempdir().expect("vault");
        setup(
            &state,
            SetupVaultInput {
                path: vault.path().to_string_lossy().into_owned(),
                create: false,
            },
        )
        .expect("sets up");
        (state, vault)
    }

    fn batch_of(paths: &[&str]) -> ChangeBatch {
        ChangeBatch {
            files: paths.iter().map(|path| path.to_string()).collect(),
            needs_full_scan: false,
        }
    }

    #[test]
    fn an_outside_edit_is_applied_and_announced_with_its_counts() {
        let (state, vault) = state_with_vault();
        fs::write(vault.path().join("a.md"), "---\nid: a1\n---\n# A\n").expect("writes");
        fs::write(vault.path().join("b.md"), "---\nid: b1\n---\n# B\n").expect("writes");

        let changed = apply_batch(&state, &batch_of(&["a.md", "b.md"])).expect("applies");

        assert_eq!(
            changed,
            Some(VaultChanged {
                added: 2,
                updated: 0,
                removed: 0
            })
        );
    }

    #[test]
    fn changes_the_index_already_knows_about_are_not_announced() {
        let (state, vault) = state_with_vault();
        fs::write(vault.path().join("a.md"), "---\nid: a1\n---\n# A\n").expect("writes");
        apply_batch(&state, &batch_of(&["a.md"])).expect("first apply");

        let again = apply_batch(&state, &batch_of(&["a.md"])).expect("second apply");

        assert_eq!(again, None);
    }

    #[test]
    fn deletions_and_edits_are_counted() {
        let (state, vault) = state_with_vault();
        fs::write(vault.path().join("a.md"), "---\nid: a1\n---\n# A\n").expect("writes");
        fs::write(vault.path().join("b.md"), "---\nid: b1\n---\n# B\n").expect("writes");
        apply_batch(&state, &batch_of(&["a.md", "b.md"])).expect("first apply");

        fs::write(vault.path().join("a.md"), "---\nid: a1\n---\n# A edited\n").expect("writes");
        fs::remove_file(vault.path().join("b.md")).expect("removes");
        let changed = apply_batch(&state, &batch_of(&["a.md", "b.md"])).expect("applies");

        assert_eq!(
            changed,
            Some(VaultChanged {
                added: 0,
                updated: 1,
                removed: 1
            })
        );
    }

    #[test]
    fn a_note_without_an_id_that_only_gets_one_written_is_still_announced() {
        let (state, vault) = state_with_vault();
        fs::write(vault.path().join("plain.md"), "# Plain\n").expect("writes");

        let changed = apply_batch(&state, &batch_of(&["plain.md"])).expect("applies");

        assert_eq!(changed.map(|event| event.added), Some(1));
    }

    #[test]
    fn without_a_vault_there_is_nothing_to_apply() {
        let mut connection = open_in_memory().expect("opens");
        migrations::run(&mut connection).expect("migrates");
        let state = AppState::new(connection, None);

        let changed = apply_batch(&state, &batch_of(&["a.md"])).expect("applies");

        assert_eq!(changed, None);
    }

    #[test]
    fn the_event_serializes_with_camel_case_keys() {
        let json = serde_json::to_value(VaultChanged {
            added: 1,
            updated: 2,
            removed: 3,
        })
        .expect("serializes");

        assert_eq!(
            json,
            serde_json::json!({ "added": 1, "updated": 2, "removed": 3 })
        );
    }
}
