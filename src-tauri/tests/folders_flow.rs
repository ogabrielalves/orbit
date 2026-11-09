#![allow(clippy::expect_used)]

use std::fs;
use std::path::Path;

use orbit_lib::bootstrap::initialize_state;
use orbit_lib::error::AppError;
use orbit_lib::modules::folders::models::CreateFolderInput;
use orbit_lib::modules::folders::service as folders;
use orbit_lib::modules::notes::repository;
use orbit_lib::modules::notes::vault_service::{SetupVaultInput, setup};
use orbit_lib::state::AppState;

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

fn write(root: &Path, relative: &str, content: &str) {
    let path = root.join(relative);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).expect("creates dirs");
    }
    fs::write(path, content).expect("writes");
}

fn note_paths(state: &AppState) -> Vec<(String, String)> {
    repository::list_all(&state.database())
        .expect("lists")
        .into_iter()
        .map(|note| (note.path, note.id))
        .collect()
}

fn folder_paths(state: &AppState) -> Vec<String> {
    folders::list(state)
        .expect("lists")
        .into_iter()
        .map(|entry| entry.path)
        .collect()
}

#[test]
fn a_renamed_and_moved_folder_keeps_its_notes_and_ids_across_a_restart() {
    let data = tempfile::tempdir().expect("data dir");
    let vault = tempfile::tempdir().expect("vault");
    write(
        vault.path(),
        "Inbox/idea.md",
        "---\nid: idea-id\n---\n# Idea\n",
    );
    let first_run = initialize_state(data.path()).expect("first start");
    use_vault(&first_run, vault.path());
    folders::create(
        &first_run,
        CreateFolderInput {
            parent_path: None,
            name: "Projects".into(),
        },
    )
    .expect("creates");
    folders::rename(&first_run, "Inbox", "Ideas").expect("renames");
    folders::move_folder(&first_run, "Ideas", Some("Projects")).expect("moves");
    drop(first_run);

    let second_run = initialize_state(data.path()).expect("second start");

    assert_eq!(
        note_paths(&second_run),
        [("Projects/Ideas/idea.md".to_string(), "idea-id".to_string())]
    );
    assert_eq!(folder_paths(&second_run), ["Projects", "Projects/Ideas"]);
}

#[test]
fn a_recursive_delete_leaves_disk_and_index_consistent_after_a_restart() {
    let data = tempfile::tempdir().expect("data dir");
    let vault = tempfile::tempdir().expect("vault");
    write(vault.path(), "Trash/a.md", "# A\n");
    write(vault.path(), "Trash/sub/b.md", "# B\n");
    write(vault.path(), "Keep/c.md", "# C\n");
    let first_run = initialize_state(data.path()).expect("first start");
    use_vault(&first_run, vault.path());
    folders::delete(&first_run, "Trash", true).expect("deletes");
    drop(first_run);

    let second_run = initialize_state(data.path()).expect("second start");

    let paths: Vec<String> = note_paths(&second_run)
        .into_iter()
        .map(|(path, _)| path)
        .collect();
    assert_eq!(paths, ["Keep/c.md"]);
    assert_eq!(folder_paths(&second_run), ["Keep"]);
    assert!(!vault.path().join("Trash").exists());
}

#[test]
fn moving_a_folder_into_itself_is_rejected_and_changes_nothing() {
    let data = tempfile::tempdir().expect("data dir");
    let vault = tempfile::tempdir().expect("vault");
    write(vault.path(), "a/b/note.md", "# N\n");
    let state = initialize_state(data.path()).expect("starts");
    use_vault(&state, vault.path());

    let result = folders::move_folder(&state, "a", Some("a/b"));

    assert!(matches!(result, Err(AppError::InvalidMove)));
    assert!(vault.path().join("a/b/note.md").exists());
    assert_eq!(folder_paths(&state), ["a", "a/b"]);
}
