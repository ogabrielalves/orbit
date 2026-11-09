#![allow(clippy::expect_used)]

use std::fs;
use std::path::Path;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

use orbit_lib::bootstrap::initialize_state;
use orbit_lib::modules::notes::models::ListNotesInput;
use orbit_lib::modules::notes::note_service as notes;
use orbit_lib::modules::notes::vault_service::{SetupVaultInput, setup};
use orbit_lib::modules::notes::vault_watch::{VaultChanged, apply_batch};
use orbit_lib::state::AppState;
use orbit_lib::vault::watcher::VaultWatcher;

fn use_vault(state: &AppState, vault: &Path) {
    setup(
        state,
        SetupVaultInput {
            path: vault.to_string_lossy().into_owned(),
            create: true,
        },
    )
    .expect("sets up");
}

fn titles(state: &AppState) -> Vec<String> {
    notes::list(state, ListNotesInput::default())
        .expect("lists")
        .into_iter()
        .map(|note| note.title)
        .collect()
}

fn wait_until(mut condition: impl FnMut() -> bool) -> bool {
    let deadline = Instant::now() + Duration::from_secs(15);
    while Instant::now() < deadline {
        if condition() {
            return true;
        }
        thread::sleep(Duration::from_millis(50));
    }
    false
}

/// The same wiring the app uses, minus the Tauri event: watcher -> apply_batch -> index.
fn watch(
    state: &Arc<AppState>,
    vault: &Path,
    announced: &Arc<Mutex<Vec<VaultChanged>>>,
) -> VaultWatcher {
    let for_callback = Arc::clone(state);
    let sink = Arc::clone(announced);
    VaultWatcher::start(
        vault.to_path_buf(),
        Duration::from_millis(150),
        move |batch| {
            if let Some(changed) = apply_batch(&for_callback, &batch).expect("applies") {
                sink.lock().expect("lock").push(changed);
            }
        },
    )
    .expect("starts")
}

#[test]
fn notes_created_edited_moved_and_deleted_outside_the_app_reach_the_index_while_it_runs() {
    let data = tempfile::tempdir().expect("data dir");
    let vault = tempfile::tempdir().expect("vault");
    let state = Arc::new(initialize_state(data.path()).expect("starts"));
    use_vault(&state, vault.path());
    let announced = Arc::new(Mutex::new(Vec::new()));
    let watcher = watch(&state, vault.path(), &announced);

    fs::write(
        vault.path().join("Outside.md"),
        "---\nid: out1\n---\n# Outside\n",
    )
    .expect("creates");
    assert!(
        wait_until(|| titles(&state) == ["Outside"]),
        "creation was not indexed"
    );

    fs::write(
        vault.path().join("Outside.md"),
        "---\nid: out1\n---\n# Outside edited\n",
    )
    .expect("edits");
    assert!(
        wait_until(|| titles(&state) == ["Outside edited"]),
        "edit was not indexed"
    );

    fs::create_dir(vault.path().join("Moved")).expect("creates dir");
    fs::rename(
        vault.path().join("Outside.md"),
        vault.path().join("Moved").join("Outside.md"),
    )
    .expect("moves");
    assert!(
        wait_until(|| {
            notes::list(&state, ListNotesInput::default())
                .expect("lists")
                .iter()
                .any(|note| note.path == "Moved/Outside.md" && note.id == "out1")
        }),
        "move was not followed"
    );

    fs::remove_file(vault.path().join("Moved").join("Outside.md")).expect("deletes");
    assert!(
        wait_until(|| titles(&state).is_empty()),
        "deletion was not indexed"
    );
    drop(watcher);

    assert!(!announced.lock().expect("lock").is_empty());
}

#[test]
fn the_apps_own_saves_are_not_announced_as_outside_changes() {
    let data = tempfile::tempdir().expect("data dir");
    let vault = tempfile::tempdir().expect("vault");
    let state = Arc::new(initialize_state(data.path()).expect("starts"));
    use_vault(&state, vault.path());
    let announced = Arc::new(Mutex::new(Vec::new()));
    let watcher = watch(&state, vault.path(), &announced);

    let note = notes::create(
        &state,
        orbit_lib::modules::notes::models::CreateNoteInput {
            folder_path: None,
            title: "Mine".into(),
            content: None,
            tags: None,
        },
    )
    .expect("creates");
    let opened = notes::get(&state, &note.id).expect("reads");
    notes::save(
        &state,
        &note.id,
        orbit_lib::modules::notes::models::SaveNoteInput {
            content: "# Mine\nedited by the app\n".into(),
            base_hash: opened.hash,
            tags: None,
            force: false,
        },
    )
    .expect("saves");
    thread::sleep(Duration::from_millis(1200));
    drop(watcher);

    assert!(
        announced.lock().expect("lock").is_empty(),
        "{:?}",
        announced.lock().expect("lock")
    );
    assert_eq!(titles(&state), ["Mine"]);
}
