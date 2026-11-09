#![allow(clippy::expect_used)]

use std::fs;
use std::path::Path;

use orbit_lib::bootstrap::initialize_state;
use orbit_lib::error::AppError;
use orbit_lib::modules::activity::models::{ActivityAction, EntityType};
use orbit_lib::modules::activity::service as activity;
use orbit_lib::modules::notes::models::{CreateNoteInput, ListNotesInput, SaveNoteInput};
use orbit_lib::modules::notes::note_service as notes;
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

fn new_note(state: &AppState, title: &str, content: Option<&str>) -> String {
    notes::create(
        state,
        CreateNoteInput {
            folder_path: None,
            title: title.into(),
            content: content.map(str::to_string),
            tags: Some(vec!["draft".into()]),
        },
    )
    .expect("creates note")
    .id
}

fn paths(state: &AppState) -> Vec<String> {
    notes::list(state, ListNotesInput::default())
        .expect("lists")
        .into_iter()
        .map(|note| note.path)
        .collect()
}

#[test]
fn notes_their_content_and_ids_survive_a_restart() {
    let data = tempfile::tempdir().expect("data dir");
    let vault = tempfile::tempdir().expect("vault");
    let first_run = initialize_state(data.path()).expect("first start");
    use_vault(&first_run, vault.path());
    let id = new_note(&first_run, "Spring Boot", None);
    let opened = notes::get(&first_run, &id).expect("reads");
    notes::save(
        &first_run,
        &id,
        SaveNoteInput {
            content: "# Spring Boot\n\nUses [[Hibernate]].\n".into(),
            base_hash: opened.hash,
            tags: Some(vec!["java".into(), "backend".into()]),
            force: false,
        },
    )
    .expect("saves");
    drop(first_run);

    let second_run = initialize_state(data.path()).expect("second start");
    let reloaded = notes::get(&second_run, &id).expect("reads");

    assert_eq!(reloaded.title, "Spring Boot");
    assert_eq!(reloaded.tags, ["java", "backend"]);
    assert_eq!(reloaded.content, "# Spring Boot\n\nUses [[Hibernate]].\n");
    let links = repository::list_links(&second_run.database(), &id).expect("lists");
    assert_eq!(links.len(), 1);
    assert_eq!(links[0].target_key, "hibernate");
}

#[test]
fn an_edit_made_in_another_editor_is_never_overwritten_by_a_stale_save() {
    let data = tempfile::tempdir().expect("data dir");
    let vault = tempfile::tempdir().expect("vault");
    let state = initialize_state(data.path()).expect("starts");
    use_vault(&state, vault.path());
    let id = new_note(&state, "Shared", None);
    let opened = notes::get(&state, &id).expect("reads");

    let path = vault.path().join("Shared.md");
    let external = format!("---\nid: {id}\n---\n# Shared\nwritten in another editor\n");
    fs::write(&path, &external).expect("external edit");
    let stale = notes::save(
        &state,
        &id,
        SaveNoteInput {
            content: "# Shared\nmine\n".into(),
            base_hash: opened.hash,
            tags: None,
            force: false,
        },
    );

    assert!(matches!(stale, Err(AppError::Conflict(_))));
    assert_eq!(fs::read_to_string(&path).expect("reads"), external);
    let fresh = notes::get(&state, &id).expect("reads");
    assert!(fresh.content.contains("another editor"));
    let retried = notes::save(
        &state,
        &id,
        SaveNoteInput {
            content: "# Shared\nmerged by hand\n".into(),
            base_hash: fresh.hash,
            tags: None,
            force: false,
        },
    )
    .expect("saves with the fresh hash");
    assert_eq!(retried.content, "# Shared\nmerged by hand\n");
}

#[test]
fn renaming_a_note_rewrites_the_links_on_disk_and_the_result_survives_a_restart() {
    let data = tempfile::tempdir().expect("data dir");
    let vault = tempfile::tempdir().expect("vault");
    let first_run = initialize_state(data.path()).expect("first start");
    use_vault(&first_run, vault.path());
    let target = new_note(&first_run, "Hibernate", None);
    let source = new_note(
        &first_run,
        "Notes",
        Some("# Notes\nSee [[Hibernate]] and [[hibernate|the ORM]].\n"),
    );
    let result = notes::rename(&first_run, &target, "JPA").expect("renames");
    drop(first_run);

    let second_run = initialize_state(data.path()).expect("second start");

    assert_eq!(result.rewritten_notes, 1);
    let text = fs::read_to_string(vault.path().join("Notes.md")).expect("reads");
    assert!(text.contains("See [[JPA]] and [[JPA|the ORM]]."));
    assert_eq!(paths(&second_run), ["JPA.md", "Notes.md"]);
    let links = repository::list_links(&second_run.database(), &source).expect("lists");
    assert_eq!(links.len(), 1);
    assert_eq!(
        (links[0].target_key.as_str(), links[0].link_count),
        ("jpa", 2)
    );
    assert_eq!(
        notes::get(&second_run, &target).expect("reads").title,
        "JPA"
    );
}

#[test]
fn moving_and_deleting_notes_keep_disk_and_index_consistent_across_restarts() {
    let data = tempfile::tempdir().expect("data dir");
    let vault = tempfile::tempdir().expect("vault");
    fs::create_dir_all(vault.path().join("Archive")).expect("creates dir");
    let first_run = initialize_state(data.path()).expect("first start");
    use_vault(&first_run, vault.path());
    let keep = new_note(&first_run, "Keep", None);
    let doomed = new_note(&first_run, "Doomed", None);
    notes::move_note(&first_run, &keep, Some("Archive")).expect("moves");
    notes::delete(&first_run, &doomed).expect("deletes");
    drop(first_run);

    let second_run = initialize_state(data.path()).expect("second start");

    assert_eq!(paths(&second_run), ["Archive/Keep.md"]);
    assert_eq!(
        notes::get(&second_run, &keep).expect("reads").path,
        "Archive/Keep.md"
    );
    assert!(matches!(
        notes::get(&second_run, &doomed),
        Err(AppError::NotFound(_))
    ));
    assert!(!vault.path().join("Doomed.md").exists());
}

#[test]
fn note_history_survives_a_restart_and_a_vault_rebuild_keeps_the_ids() {
    let data = tempfile::tempdir().expect("data dir");
    let vault = tempfile::tempdir().expect("vault");
    let first_run = initialize_state(data.path()).expect("first start");
    use_vault(&first_run, vault.path());
    let id = new_note(&first_run, "History", None);
    notes::rename(&first_run, &id, "Chronicle").expect("renames");
    first_run
        .database()
        .execute("DELETE FROM notes", [])
        .expect("wipes the index");
    drop(first_run);

    let second_run = initialize_state(data.path()).expect("second start");
    let entries = activity::history(&second_run, EntityType::Note, &id, None).expect("reads");

    assert_eq!(
        notes::get(&second_run, &id).expect("reads").title,
        "Chronicle"
    );
    let actions: Vec<ActivityAction> = entries.iter().map(|entry| entry.action).collect();
    assert_eq!(actions, [ActivityAction::Updated, ActivityAction::Created]);
}
