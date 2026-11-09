#![allow(clippy::expect_used)]

use std::fs;

use orbit_lib::bootstrap::initialize_state;
use orbit_lib::modules::notes::image_service::{PasteImageInput, read, save_pasted};
use orbit_lib::modules::notes::models::CreateNoteInput;
use orbit_lib::modules::notes::note_service as notes;
use orbit_lib::modules::notes::vault_service::{SetupVaultInput, setup};

const PNG: &[u8] = &[0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A, 5, 6, 7, 8];

#[test]
fn a_pasted_image_and_the_note_that_embeds_it_survive_a_restart() {
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
    fs::create_dir_all(vault.path().join("Docs")).expect("creates dir");
    let note = notes::create(
        &first_run,
        CreateNoteInput {
            folder_path: Some("Docs".into()),
            title: "With picture".into(),
            content: None,
            tags: None,
        },
    )
    .expect("creates note");
    let image = save_pasted(
        &first_run,
        PasteImageInput {
            note_id: note.id.clone(),
            data: PNG.to_vec(),
        },
    )
    .expect("stores image");
    let opened = notes::get(&first_run, &note.id).expect("reads");
    notes::save(
        &first_run,
        &note.id,
        orbit_lib::modules::notes::models::SaveNoteInput {
            content: format!("# With picture\n\n{}\n", image.markdown),
            base_hash: opened.hash,
            tags: None,
            force: false,
        },
    )
    .expect("saves");
    drop(first_run);

    let second_run = initialize_state(data.path()).expect("second start");
    let reloaded = notes::get(&second_run, &note.id).expect("reads");
    let stored = read(&second_run, &image.path).expect("reads image");

    assert!(
        reloaded
            .content
            .contains(&format!("![](../{})", image.path))
    );
    assert_eq!(stored.data, PNG);
    assert_eq!(stored.mime_type, "image/png");
    let indexed: Vec<String> = notes::list(&second_run, Default::default())
        .expect("lists")
        .into_iter()
        .map(|note| note.path)
        .collect();
    assert_eq!(indexed, ["Docs/With picture.md"]);
}
