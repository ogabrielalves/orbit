#![allow(clippy::expect_used)]

use std::fs;

use orbit_lib::bootstrap::initialize_state;
use orbit_lib::modules::favorites::models::{FavoriteRef, FavoriteType};
use orbit_lib::modules::favorites::service as favorites;
use orbit_lib::modules::folders::models::CreateFolderInput;
use orbit_lib::modules::folders::service as folders;
use orbit_lib::modules::notes::models::CreateNoteInput;
use orbit_lib::modules::notes::note_service as notes;
use orbit_lib::modules::notes::vault_service::{SetupVaultInput, setup};
use orbit_lib::modules::projects::models::CreateProjectInput;
use orbit_lib::modules::projects::service as projects;
use orbit_lib::state::AppState;

fn reference(kind: FavoriteType, id: &str) -> FavoriteRef {
    FavoriteRef {
        entity_type: kind,
        entity_id: id.into(),
    }
}

fn titles(state: &AppState) -> Vec<String> {
    favorites::list(state)
        .expect("lists")
        .into_iter()
        .map(|entry| entry.title)
        .collect()
}

#[test]
fn favorites_and_their_order_survive_a_restart() {
    let data = tempfile::tempdir().expect("data dir");
    let vault = tempfile::tempdir().expect("vault");
    let first_run = initialize_state(data.path()).expect("first start");
    setup(
        &first_run,
        SetupVaultInput {
            path: vault.path().to_string_lossy().into_owned(),
            create: true,
        },
    )
    .expect("sets up");
    let project = projects::create(
        &first_run,
        CreateProjectInput {
            name: "Website".into(),
            description: None,
            icon: None,
            color: None,
        },
    )
    .expect("creates project");
    let note = notes::create(
        &first_run,
        CreateNoteInput {
            folder_path: None,
            title: "Ideas".into(),
            content: None,
            tags: None,
        },
    )
    .expect("creates note");
    folders::create(
        &first_run,
        CreateFolderInput {
            parent_path: None,
            name: "Inbox".into(),
        },
    )
    .expect("creates folder");
    for item in [
        reference(FavoriteType::Project, &project.id),
        reference(FavoriteType::Note, &note.id),
        reference(FavoriteType::Folder, "Inbox"),
    ] {
        favorites::toggle(&first_run, item).expect("pins");
    }
    favorites::move_favorite(&first_run, reference(FavoriteType::Folder, "Inbox"), None)
        .expect("moves first");
    drop(first_run);

    let second_run = initialize_state(data.path()).expect("second start");

    assert_eq!(titles(&second_run), ["Inbox", "Website", "Ideas"]);
}

#[test]
fn a_favorite_follows_the_item_through_deletes_and_vault_changes_made_while_the_app_was_closed() {
    let data = tempfile::tempdir().expect("data dir");
    let vault = tempfile::tempdir().expect("vault");
    let first_run = initialize_state(data.path()).expect("first start");
    setup(
        &first_run,
        SetupVaultInput {
            path: vault.path().to_string_lossy().into_owned(),
            create: true,
        },
    )
    .expect("sets up");
    let note = notes::create(
        &first_run,
        CreateNoteInput {
            folder_path: None,
            title: "Doomed".into(),
            content: None,
            tags: None,
        },
    )
    .expect("creates note");
    folders::create(
        &first_run,
        CreateFolderInput {
            parent_path: None,
            name: "Doomed folder".into(),
        },
    )
    .expect("creates folder");
    favorites::toggle(&first_run, reference(FavoriteType::Note, &note.id)).expect("pins note");
    favorites::toggle(&first_run, reference(FavoriteType::Folder, "Doomed folder"))
        .expect("pins folder");
    drop(first_run);

    fs::remove_file(vault.path().join("Doomed.md")).expect("deletes the note outside the app");
    fs::remove_dir(vault.path().join("Doomed folder")).expect("deletes the folder outside the app");
    let second_run = initialize_state(data.path()).expect("second start");

    assert!(titles(&second_run).is_empty());
    let rows: i64 = second_run
        .database()
        .query_row("SELECT COUNT(*) FROM favorites", [], |row| row.get(0))
        .expect("counts");
    assert_eq!(rows, 0, "both rows were cleaned up by the startup reindex");
}
