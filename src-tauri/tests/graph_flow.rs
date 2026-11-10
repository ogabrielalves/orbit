#![allow(clippy::expect_used)]

use std::fs;

use orbit_lib::bootstrap::initialize_state;
use orbit_lib::modules::graph::models::{GraphInput, GraphNodeKind, LocalGraphInput};
use orbit_lib::modules::graph::service as graph;
use orbit_lib::modules::notes::models::CreateNoteInput;
use orbit_lib::modules::notes::note_service as notes;
use orbit_lib::modules::notes::vault_service::{SetupVaultInput, setup};
use orbit_lib::state::AppState;

fn use_vault(state: &AppState, vault: &std::path::Path) {
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
            content: Some(format!("# {title}\n{body}\n")),
            tags: None,
        },
    )
    .expect("creates note")
    .id
}

#[test]
fn the_graph_survives_a_restart_and_picks_up_notes_edited_while_the_app_was_closed() {
    let data = tempfile::tempdir().expect("data dir");
    let vault = tempfile::tempdir().expect("vault");
    let first_run = initialize_state(data.path()).expect("first start");
    use_vault(&first_run, vault.path());
    let hub = new_note(&first_run, "Hub", "[[Spoke one]] [[Spoke two]] [[Nowhere]]");
    new_note(&first_run, "Spoke one", "[[Hub]]");
    new_note(&first_run, "Spoke two", "");
    drop(first_run);

    fs::write(
        vault.path().join("Spoke three.md"),
        "# Spoke three\n[[Spoke two]]\n",
    )
    .expect("writes outside the app");
    let second_run = initialize_state(data.path()).expect("second start");
    let full = graph::full(
        &second_run,
        GraphInput {
            include_unresolved: true,
        },
    )
    .expect("builds");
    let local = graph::local(
        &second_run,
        LocalGraphInput {
            note_id: hub,
            depth: Some(2),
            include_unresolved: false,
        },
    )
    .expect("builds");

    assert_eq!(full.nodes.len(), 5, "four notes and one unresolved title");
    assert_eq!(
        full.nodes
            .iter()
            .filter(|node| node.kind == GraphNodeKind::Unresolved)
            .count(),
        1
    );
    assert_eq!(full.edges.len(), 5);
    let local_titles: Vec<&str> = local.nodes.iter().map(|node| node.title.as_str()).collect();
    assert_eq!(
        local_titles,
        ["Hub", "Spoke one", "Spoke three", "Spoke two"]
    );
    let three = local
        .nodes
        .iter()
        .find(|node| node.title == "Spoke three")
        .expect("node");
    assert_eq!(three.distance, Some(2));
}
