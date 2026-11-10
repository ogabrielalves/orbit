#![allow(clippy::expect_used)]

use std::fs;
use std::time::Duration;

use orbit_lib::bootstrap::initialize_state;
use orbit_lib::modules::dashboard::recent_notes::{RecentNotesInput, list};
use orbit_lib::modules::notes::models::CreateNoteInput;
use orbit_lib::modules::notes::note_service as notes;
use orbit_lib::modules::notes::vault_service::{SetupVaultInput, setup};

#[test]
fn recent_notes_survive_a_restart_and_notes_edited_while_closed_move_to_the_top() {
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
    for title in ["Older", "Newer"] {
        notes::create(
            &first_run,
            CreateNoteInput {
                folder_path: None,
                title: title.into(),
                content: Some(format!("# {title}\nbody of {title}\n")),
                tags: None,
            },
        )
        .expect("creates note");
        std::thread::sleep(Duration::from_millis(20));
    }
    let titles = |state: &orbit_lib::state::AppState| -> Vec<String> {
        list(state, RecentNotesInput { limit: None })
            .expect("lists")
            .into_iter()
            .map(|note| note.title)
            .collect()
    };
    assert_eq!(titles(&first_run), ["Newer", "Older"]);
    drop(first_run);

    std::thread::sleep(Duration::from_millis(20));
    let older = vault.path().join("Older.md");
    let text = fs::read_to_string(&older).expect("reads");
    fs::write(&older, format!("{text}added while the app was closed\n")).expect("edits");
    let second_run = initialize_state(data.path()).expect("second start");

    assert_eq!(titles(&second_run), ["Older", "Newer"]);
    let notes = list(&second_run, RecentNotesInput { limit: Some(1) }).expect("lists");
    assert_eq!(
        notes[0].excerpt,
        "body of Older added while the app was closed"
    );
}
