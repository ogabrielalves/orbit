use std::fs;

use serde::{Deserialize, Serialize};
use specta::Type;

use super::repository;
use super::vault_service::vault_root;
use crate::error::{AppError, AppResult};
use crate::state::AppState;
use crate::vault::hash::content_hash;
use crate::vault::images::{self, ImageKind};
use crate::vault::indexer::ATTACHMENTS_DIRECTORY;
use crate::vault::paths::absolute;
use crate::vault::writer::write_atomic;

pub const MAX_IMAGE_BYTES: usize = 10 * 1024 * 1024;
const NAME_HASH_LENGTH: usize = 12;

#[derive(Debug, Clone, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct PasteImageInput {
    pub note_id: String,
    pub data: Vec<u8>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct PastedImage {
    pub path: String,
    pub markdown: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct VaultImage {
    pub mime_type: String,
    pub data: Vec<u8>,
}

pub fn save_pasted(state: &AppState, input: PasteImageInput) -> AppResult<PastedImage> {
    let root = vault_root(state)?;
    let is_empty = input.data.is_empty();
    if is_empty {
        return Err(AppError::Validation("the image is empty".into()));
    }
    let is_too_large = input.data.len() > MAX_IMAGE_BYTES;
    if is_too_large {
        return Err(AppError::Validation(
            "the image is too large (10 MB limit)".into(),
        ));
    }
    let kind = images::detect(&input.data).ok_or_else(|| {
        AppError::Validation("only PNG, JPEG, GIF, WebP and BMP images can be pasted".into())
    })?;

    let note_path = {
        let connection = state.database();
        repository::find_by_id(&connection, &input.note_id)?
            .ok_or_else(|| AppError::NotFound("note".into()))?
            .path
    };

    let directory = absolute(&root, ATTACHMENTS_DIRECTORY);
    ensure_directory(&directory)?;
    let name = store(&directory, &input.data, kind)?;
    let path = format!("{ATTACHMENTS_DIRECTORY}/{name}");
    Ok(PastedImage {
        markdown: format!("![]({}{path})", climb_to_root(&note_path)),
        path,
    })
}

pub fn read(state: &AppState, path: &str) -> AppResult<VaultImage> {
    let root = vault_root(state)?;
    let name = attachment_name(path)?;
    let kind = name
        .rsplit_once('.')
        .and_then(|(_, extension)| ImageKind::from_extension(extension))
        .ok_or_else(|| AppError::Validation("that file is not an image".into()))?;

    let file = absolute(&root, ATTACHMENTS_DIRECTORY).join(name);
    let metadata = fs::symlink_metadata(&file).map_err(|_| AppError::NotFound("image".into()))?;
    let is_regular_file = metadata.is_file() && !metadata.file_type().is_symlink();
    if !is_regular_file {
        return Err(AppError::NotFound("image".into()));
    }
    Ok(VaultImage {
        mime_type: kind.mime_type().to_string(),
        data: fs::read(file)?,
    })
}

fn store(directory: &std::path::Path, data: &[u8], kind: ImageKind) -> AppResult<String> {
    let hash = content_hash(data);
    let short = format!("pasted-{}.{}", &hash[..NAME_HASH_LENGTH], kind.extension());
    let full = format!("pasted-{hash}.{}", kind.extension());
    for name in [short, full] {
        let target = directory.join(&name);
        match fs::read(&target) {
            Ok(existing) if existing == data => return Ok(name),
            Ok(_) => continue,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                write_atomic(&target, data)?;
                return Ok(name);
            }
            Err(error) => return Err(error.into()),
        }
    }
    log::error!("two different images share the same content hash");
    Err(AppError::Internal)
}

fn ensure_directory(directory: &std::path::Path) -> AppResult<()> {
    match fs::symlink_metadata(directory) {
        Ok(metadata) => {
            let is_real_directory = metadata.is_dir() && !metadata.file_type().is_symlink();
            if !is_real_directory {
                return Err(AppError::Validation(
                    "the attachments entry in the vault is not a regular folder".into(),
                ));
            }
            Ok(())
        }
        Err(_) => Ok(fs::create_dir_all(directory)?),
    }
}

fn climb_to_root(note_path: &str) -> String {
    let depth = note_path.matches('/').count();
    "../".repeat(depth)
}

fn attachment_name(path: &str) -> AppResult<&str> {
    let invalid = || AppError::Validation("invalid image path".into());
    let name = path
        .trim()
        .strip_prefix(ATTACHMENTS_DIRECTORY)
        .and_then(|rest| rest.strip_prefix('/'))
        .ok_or_else(invalid)?;
    let is_plain =
        !name.is_empty() && !name.starts_with('.') && !name.contains(['/', '\\', ':', '\0']);
    if !is_plain {
        return Err(invalid());
    }
    Ok(name)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{connection::open_in_memory, migrations};
    use crate::modules::notes::models::CreateNoteInput;
    use crate::modules::notes::note_service as notes;
    use crate::modules::notes::vault_service::{SetupVaultInput, reindex, setup};

    const PNG: &[u8] = &[0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A, 1, 2, 3, 4];

    struct Fixture {
        state: AppState,
        vault: tempfile::TempDir,
    }

    fn fixture() -> Fixture {
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
        Fixture { state, vault }
    }

    fn note_in(fixture: &Fixture, folder: Option<&str>, title: &str) -> String {
        if let Some(folder) = folder {
            fs::create_dir_all(fixture.vault.path().join(folder)).expect("creates dir");
        }
        notes::create(
            &fixture.state,
            CreateNoteInput {
                folder_path: folder.map(str::to_string),
                title: title.into(),
                content: None,
                tags: None,
            },
        )
        .expect("creates note")
        .id
    }

    fn paste(fixture: &Fixture, note_id: &str, data: &[u8]) -> AppResult<PastedImage> {
        save_pasted(
            &fixture.state,
            PasteImageInput {
                note_id: note_id.into(),
                data: data.to_vec(),
            },
        )
    }

    fn stored(fixture: &Fixture) -> Vec<String> {
        let directory = fixture.vault.path().join(ATTACHMENTS_DIRECTORY);
        let Ok(entries) = fs::read_dir(directory) else {
            return Vec::new();
        };
        let mut names: Vec<String> = entries
            .map(|entry| {
                entry
                    .expect("entry")
                    .file_name()
                    .to_string_lossy()
                    .into_owned()
            })
            .collect();
        names.sort();
        names
    }

    #[test]
    fn a_pasted_image_is_stored_in_the_vault_attachments_and_returns_ready_markdown() {
        let fixture = fixture();
        let note = note_in(&fixture, None, "Note");

        let image = paste(&fixture, &note, PNG).expect("stores");

        assert!(image.path.starts_with("attachments/pasted-"));
        assert!(image.path.ends_with(".png"));
        assert_eq!(image.markdown, format!("![]({})", image.path));
        let on_disk = fs::read(fixture.vault.path().join(&image.path)).expect("reads");
        assert_eq!(on_disk, PNG);
        assert_eq!(stored(&fixture).len(), 1);
    }

    #[test]
    fn the_markdown_link_is_relative_to_the_notes_folder() {
        let fixture = fixture();
        let top = note_in(&fixture, None, "Top");
        let nested = note_in(&fixture, Some("a/b"), "Nested");

        let from_top = paste(&fixture, &top, PNG).expect("stores");
        let from_nested = paste(&fixture, &nested, PNG).expect("stores");

        assert_eq!(from_top.markdown, format!("![]({})", from_top.path));
        assert_eq!(
            from_nested.markdown,
            format!("![](../../{})", from_nested.path)
        );
        assert_eq!(from_top.path, from_nested.path);
    }

    #[test]
    fn pasting_the_same_image_twice_reuses_one_file_and_different_images_get_different_files() {
        let fixture = fixture();
        let note = note_in(&fixture, None, "Note");
        let other: Vec<u8> = PNG.iter().copied().chain([9, 9]).collect();

        let first = paste(&fixture, &note, PNG).expect("stores");
        let again = paste(&fixture, &note, PNG).expect("stores");
        let different = paste(&fixture, &note, &other).expect("stores");

        assert_eq!(first.path, again.path);
        assert_ne!(first.path, different.path);
        assert_eq!(stored(&fixture).len(), 2);
    }

    #[test]
    fn every_supported_format_gets_its_own_extension_whatever_the_caller_claims() {
        let fixture = fixture();
        let note = note_in(&fixture, None, "Note");
        let cases: [(&[u8], &str); 5] = [
            (PNG, ".png"),
            (&[0xFF, 0xD8, 0xFF, 0xE0, 0, 1], ".jpg"),
            (b"GIF89a\x01\x00\x01", ".gif"),
            (b"RIFF\x24\x00\x00\x00WEBPVP8 ", ".webp"),
            (
                b"BM\x36\x00\x00\x00\x00\x00\x00\x00\x36\x00\x00\x00",
                ".bmp",
            ),
        ];

        for (bytes, extension) in cases {
            let image = paste(&fixture, &note, bytes).expect("stores");
            assert!(
                image.path.ends_with(extension),
                "{} should end with {extension}",
                image.path
            );
        }
    }

    #[test]
    fn empty_oversized_and_non_image_data_are_rejected_without_creating_anything() {
        let fixture = fixture();
        let note = note_in(&fixture, None, "Note");
        let too_large: Vec<u8> = PNG
            .iter()
            .copied()
            .chain(std::iter::repeat_n(0u8, MAX_IMAGE_BYTES))
            .collect();

        assert!(matches!(
            paste(&fixture, &note, b""),
            Err(AppError::Validation(_))
        ));
        assert!(matches!(
            paste(&fixture, &note, &too_large),
            Err(AppError::Validation(_))
        ));
        for bad in [
            &b"<svg xmlns=\"http://www.w3.org/2000/svg\"/>"[..],
            b"<script>alert(1)</script>",
            b"MZ\x90\x00",
            b"just text",
        ] {
            assert!(matches!(
                paste(&fixture, &note, bad),
                Err(AppError::Validation(_))
            ));
        }
        assert!(stored(&fixture).is_empty());
        assert!(!fixture.vault.path().join(ATTACHMENTS_DIRECTORY).exists());
    }

    #[test]
    fn an_image_of_exactly_the_size_limit_is_accepted() {
        let fixture = fixture();
        let note = note_in(&fixture, None, "Note");
        let mut data = PNG.to_vec();
        data.resize(MAX_IMAGE_BYTES, 7);

        assert!(paste(&fixture, &note, &data).is_ok());
    }

    #[test]
    fn the_note_and_the_vault_must_exist() {
        let fixture = fixture();
        let mut connection = open_in_memory().expect("opens");
        migrations::run(&mut connection).expect("migrates");
        let no_vault = AppState::new(connection, None);

        assert!(matches!(
            paste(&fixture, "ghost", PNG),
            Err(AppError::NotFound(_))
        ));
        assert!(matches!(
            save_pasted(
                &no_vault,
                PasteImageInput {
                    note_id: "x".into(),
                    data: PNG.to_vec()
                }
            ),
            Err(AppError::NotFound(_))
        ));
        assert!(stored(&fixture).is_empty());
    }

    #[test]
    fn a_file_named_attachments_in_the_vault_blocks_storing_with_a_clear_error() {
        let fixture = fixture();
        let note = note_in(&fixture, None, "Note");
        fs::write(
            fixture.vault.path().join(ATTACHMENTS_DIRECTORY),
            "i am a file",
        )
        .expect("writes");

        assert!(matches!(
            paste(&fixture, &note, PNG),
            Err(AppError::Validation(_))
        ));
    }

    #[test]
    fn stored_images_are_never_indexed_as_notes_and_leave_no_temporary_files() {
        let fixture = fixture();
        let note = note_in(&fixture, None, "Note");
        paste(&fixture, &note, PNG).expect("stores");

        let report = reindex(&fixture.state).expect("reindexes");

        assert_eq!(report.added + report.updated + report.unchanged, 1);
        assert!(
            stored(&fixture)
                .iter()
                .all(|name| !name.starts_with(".orbit-tmp-"))
        );
    }

    #[test]
    fn a_stored_image_can_be_read_back_with_its_mime_type() {
        let fixture = fixture();
        let note = note_in(&fixture, None, "Note");
        let image = paste(&fixture, &note, PNG).expect("stores");

        let read_back = read(&fixture.state, &image.path).expect("reads");

        assert_eq!(read_back.mime_type, "image/png");
        assert_eq!(read_back.data, PNG);
    }

    #[test]
    fn reading_rejects_traversal_other_folders_non_images_and_missing_files() {
        let fixture = fixture();
        let note = note_in(&fixture, None, "Note");
        fs::create_dir_all(fixture.vault.path().join(ATTACHMENTS_DIRECTORY)).expect("creates dir");
        fs::write(
            fixture
                .vault
                .path()
                .join(ATTACHMENTS_DIRECTORY)
                .join("notes.txt"),
            "x",
        )
        .expect("writes");
        fs::write(fixture.vault.path().join("secret.png"), PNG).expect("writes");
        let _ = note;

        for bad in [
            "attachments/../secret.png",
            "../secret.png",
            "secret.png",
            "attachments/sub/x.png",
            "attachments\\x.png",
            "attachments/",
            "attachments",
            "attachments/.hidden.png",
            "/attachments/x.png",
        ] {
            assert!(
                matches!(read(&fixture.state, bad), Err(AppError::Validation(_))),
                "{bad}"
            );
        }
        assert!(matches!(
            read(&fixture.state, "attachments/notes.txt"),
            Err(AppError::Validation(_))
        ));
        assert!(matches!(
            read(&fixture.state, "attachments/ghost.png"),
            Err(AppError::NotFound(_))
        ));
    }

    #[test]
    fn a_folder_named_like_an_image_is_not_served() {
        let fixture = fixture();
        fs::create_dir_all(fixture.vault.path().join("attachments/trap.png")).expect("creates dir");

        let result = read(&fixture.state, "attachments/trap.png");

        assert!(matches!(result, Err(AppError::NotFound(_))));
    }

    #[test]
    fn pasting_fails_without_overwriting_when_the_target_name_is_a_folder() {
        let fixture = fixture();
        let note = note_in(&fixture, None, "Note");
        let hash = content_hash(PNG);
        let blocked = fixture.vault.path().join(format!(
            "attachments/pasted-{}.png",
            &hash[..NAME_HASH_LENGTH]
        ));
        fs::create_dir_all(&blocked).expect("creates dir");

        let result = paste(&fixture, &note, PNG);

        assert!(result.is_err());
        assert!(blocked.is_dir());
        assert_eq!(stored(&fixture).len(), 1);
    }

    #[test]
    fn the_depth_prefix_matches_the_folder_level() {
        assert_eq!(climb_to_root("note.md"), "");
        assert_eq!(climb_to_root("a/note.md"), "../");
        assert_eq!(climb_to_root("a/b/c/note.md"), "../../../");
    }
}
