#![allow(clippy::expect_used)]

use std::fs;
use std::path::Path;

use orbit_lib::bootstrap::initialize_state;
use orbit_lib::error::AppError;
use orbit_lib::modules::notes::repository;
use orbit_lib::modules::notes::vault_service::{SetupVaultInput, reindex, setup};
use orbit_lib::state::AppState;

fn write(root: &Path, relative: &str, content: &str) {
    let path = root.join(relative);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).expect("creates dirs");
    }
    fs::write(path, content).expect("writes");
}

fn use_vault(state: &AppState, vault: &Path) -> u32 {
    setup(
        state,
        SetupVaultInput {
            path: vault.to_string_lossy().into_owned(),
            create: true,
        },
    )
    .expect("sets up")
    .note_count
}

fn indexed_paths(state: &AppState) -> Vec<String> {
    repository::list_all(&state.database())
        .expect("lists")
        .into_iter()
        .map(|note| note.path)
        .collect()
}

#[test]
fn setting_up_a_vault_indexes_the_notes_it_already_contains() {
    let data = tempfile::tempdir().expect("data dir");
    let vault = tempfile::tempdir().expect("vault");
    write(vault.path(), "a.md", "# A\n");
    write(vault.path(), "Folder/b.md", "# B\n[[A]]\n");
    write(vault.path(), "ignored.txt", "not a note");
    let state = initialize_state(data.path()).expect("starts");

    let count = use_vault(&state, vault.path());

    assert_eq!(count, 2);
    assert_eq!(indexed_paths(&state), ["Folder/b.md", "a.md"]);
}

#[test]
fn edits_made_while_the_app_was_closed_are_picked_up_at_the_next_start() {
    let data = tempfile::tempdir().expect("data dir");
    let vault = tempfile::tempdir().expect("vault");
    write(
        vault.path(),
        "stays.md",
        "---\nid: stays-id\n---\n# Stays\n",
    );
    write(
        vault.path(),
        "moves.md",
        "---\nid: moves-id\n---\n# Moves\n",
    );
    write(vault.path(), "goes.md", "---\nid: goes-id\n---\n# Goes\n");
    let first_run = initialize_state(data.path()).expect("first start");
    use_vault(&first_run, vault.path());
    drop(first_run);

    fs::rename(
        vault.path().join("moves.md"),
        vault.path().join("moved-away.md"),
    )
    .expect("moves");
    fs::remove_file(vault.path().join("goes.md")).expect("removes");
    write(vault.path(), "new.md", "# Brand new\n");
    write(
        vault.path(),
        "stays.md",
        "---\nid: stays-id\n---\n# Stays, edited\n",
    );
    let second_run = initialize_state(data.path()).expect("second start");

    assert_eq!(
        indexed_paths(&second_run),
        ["moved-away.md", "new.md", "stays.md"]
    );
    let notes = repository::list_all(&second_run.database()).expect("lists");
    let moved = notes
        .iter()
        .find(|note| note.path == "moved-away.md")
        .expect("moved note");
    assert_eq!(moved.id, "moves-id");
    let stays = notes
        .iter()
        .find(|note| note.path == "stays.md")
        .expect("stays");
    assert_eq!(stays.title, "Stays, edited");
}

#[test]
fn a_vault_that_disappeared_does_not_stop_the_app_from_starting() {
    let data = tempfile::tempdir().expect("data dir");
    let workspace = tempfile::tempdir().expect("workspace");
    let vault = workspace.path().join("vault");
    let first_run = initialize_state(data.path()).expect("first start");
    write(&vault, "a.md", "# A\n");
    use_vault(&first_run, &vault);
    drop(first_run);
    fs::remove_dir_all(&vault).expect("removes vault");

    let second_run = initialize_state(data.path()).expect("second start");

    assert_eq!(indexed_paths(&second_run), ["a.md"]);
    assert!(matches!(reindex(&second_run), Err(AppError::NotFound(_))));
}

#[test]
fn switching_vaults_replaces_the_index() {
    let data = tempfile::tempdir().expect("data dir");
    let first = tempfile::tempdir().expect("first vault");
    let second = tempfile::tempdir().expect("second vault");
    write(first.path(), "old.md", "# Old\n");
    write(second.path(), "fresh.md", "# Fresh\n");
    let state = initialize_state(data.path()).expect("starts");

    use_vault(&state, first.path());
    use_vault(&state, second.path());

    assert_eq!(indexed_paths(&state), ["fresh.md"]);
}

#[test]
fn reindexing_rebuilds_a_wiped_index_with_the_same_ids() {
    let data = tempfile::tempdir().expect("data dir");
    let vault = tempfile::tempdir().expect("vault");
    write(vault.path(), "a.md", "# A\n");
    let state = initialize_state(data.path()).expect("starts");
    use_vault(&state, vault.path());
    let before = repository::list_all(&state.database()).expect("lists");

    state
        .database()
        .execute("DELETE FROM notes", [])
        .expect("wipes the index");
    let report = reindex(&state).expect("reindexes");

    assert_eq!((report.added, report.ids_assigned), (1, 0));
    assert_eq!(
        repository::list_all(&state.database()).expect("lists"),
        before
    );
}
