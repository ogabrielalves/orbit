#![allow(clippy::expect_used)]

use std::fs;
use std::path::Path;

use orbit_lib::bootstrap::initialize_state;
use orbit_lib::modules::notes::link_service as links;
use orbit_lib::modules::notes::models::CreateNoteInput;
use orbit_lib::modules::notes::note_service as notes;
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

fn new_note(state: &AppState, title: &str, body: &str) -> String {
    notes::create(
        state,
        CreateNoteInput {
            folder_path: None,
            title: title.into(),
            content: Some(body.into()),
            tags: None,
        },
    )
    .expect("creates note")
    .id
}

#[test]
fn links_backlinks_and_unresolved_titles_survive_a_restart() {
    let data = tempfile::tempdir().expect("data dir");
    let vault = tempfile::tempdir().expect("vault");
    let first_run = initialize_state(data.path()).expect("first start");
    use_vault(&first_run, vault.path());
    let target = new_note(&first_run, "Hibernate", "# Hibernate\n");
    let source = new_note(&first_run, "Spring", "# Spring\n[[Hibernate]] [[Kafka]]\n");
    drop(first_run);

    let second_run = initialize_state(data.path()).expect("second start");
    let outgoing = links::for_note(&second_run, &source).expect("links");
    let incoming = links::for_note(&second_run, &target).expect("links");
    let unresolved = links::unresolved(&second_run).expect("lists");

    assert_eq!(outgoing.outgoing.len(), 2);
    assert_eq!(
        outgoing.outgoing[0]
            .resolved
            .as_ref()
            .map(|note| note.id.as_str()),
        Some(target.as_str())
    );
    assert_eq!(incoming.backlinks.len(), 1);
    assert_eq!(incoming.backlinks[0].note.id, source);
    assert_eq!(unresolved.len(), 1);
    assert_eq!(unresolved[0].target_title, "Kafka");
}

#[test]
fn a_note_written_by_another_tool_while_the_app_was_closed_shows_up_as_a_backlink() {
    let data = tempfile::tempdir().expect("data dir");
    let vault = tempfile::tempdir().expect("vault");
    let first_run = initialize_state(data.path()).expect("first start");
    use_vault(&first_run, vault.path());
    let target = new_note(&first_run, "Target", "# Target\n");
    drop(first_run);

    fs::write(
        vault.path().join("Outside.md"),
        "# Outside\nPoints at [[target]].\n",
    )
    .expect("writes");
    let second_run = initialize_state(data.path()).expect("second start");

    let incoming = links::for_note(&second_run, &target).expect("links");
    assert_eq!(incoming.backlinks.len(), 1);
    assert_eq!(incoming.backlinks[0].note.title, "Outside");
}

#[test]
fn resolving_a_title_matches_what_the_note_list_calls_it() {
    let data = tempfile::tempdir().expect("data dir");
    let vault = tempfile::tempdir().expect("vault");
    let state = initialize_state(data.path()).expect("starts");
    use_vault(&state, vault.path());
    let id = new_note(&state, "Ação Rápida", "# Ação Rápida\n");

    let resolved = links::resolve(&state, "ação  rápida#Passos").expect("resolves");

    assert_eq!(resolved.map(|note| note.id), Some(id));
}
