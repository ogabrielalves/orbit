use std::fs::{self, File};
use std::io::Write;
use std::path::Path;

use crate::error::{AppError, AppResult};
use crate::shared::id;

const TEMP_PREFIX: &str = ".orbit-tmp-";

/// Writes `content` to `target` without ever exposing a half-written file: the bytes go to a
/// temporary file in the same directory, are flushed to disk, and then renamed over the target.
/// A crash leaves either the old file or the new one, never a mix.
pub fn write_atomic(target: &Path, content: &[u8]) -> AppResult<()> {
    let directory = target
        .parent()
        .ok_or_else(|| AppError::Validation("the target path has no parent directory".into()))?;
    let temp_path = directory.join(format!("{TEMP_PREFIX}{}", id::new_id()));

    let result = write_and_rename(&temp_path, target, content);
    if result.is_err() {
        remove_quietly(&temp_path);
    }
    result
}

/// True for the temporary files left by `write_atomic`, so scans and watchers can ignore them.
pub fn is_temp_file(path: &Path) -> bool {
    path.file_name()
        .and_then(|name| name.to_str())
        .is_some_and(|name| name.starts_with(TEMP_PREFIX))
}

fn write_and_rename(temp_path: &Path, target: &Path, content: &[u8]) -> AppResult<()> {
    let mut file = File::create(temp_path)?;
    file.write_all(content)?;
    file.sync_all()?;
    drop(file);
    fs::rename(temp_path, target)?;
    Ok(())
}

fn remove_quietly(path: &Path) {
    if let Err(error) = fs::remove_file(path) {
        let was_already_gone = error.kind() == std::io::ErrorKind::NotFound;
        if !was_already_gone {
            log::warn!(
                "could not remove temporary file '{}': {error}",
                path.display()
            );
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn entries(directory: &Path) -> Vec<String> {
        let mut names: Vec<String> = fs::read_dir(directory)
            .expect("reads dir")
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
    fn creates_a_new_file_with_the_content_and_leaves_no_temporary_file() {
        let directory = tempfile::tempdir().expect("temp dir");
        let target = directory.path().join("note.md");

        write_atomic(&target, b"hello").expect("writes");

        assert_eq!(fs::read(&target).expect("reads"), b"hello");
        assert_eq!(entries(directory.path()), ["note.md"]);
    }

    #[test]
    fn replaces_an_existing_file_completely() {
        let directory = tempfile::tempdir().expect("temp dir");
        let target = directory.path().join("note.md");
        fs::write(&target, "a much longer previous content").expect("seeds");

        write_atomic(&target, b"short").expect("writes");

        assert_eq!(fs::read(&target).expect("reads"), b"short");
        assert_eq!(entries(directory.path()), ["note.md"]);
    }

    #[test]
    fn a_failed_write_keeps_the_old_file_and_cleans_up() {
        let directory = tempfile::tempdir().expect("temp dir");
        let target = directory.path().join("note.md");
        fs::write(&target, "original").expect("seeds");
        // renaming a file over a directory fails on every platform
        let blocked = directory.path().join("blocked");
        fs::create_dir(&blocked).expect("creates dir");

        let result = write_atomic(&blocked, b"new");

        assert!(result.is_err());
        assert_eq!(fs::read(&target).expect("reads"), b"original");
        assert_eq!(entries(directory.path()), ["blocked", "note.md"]);
    }

    #[test]
    fn writing_into_a_missing_directory_fails_without_creating_it() {
        let directory = tempfile::tempdir().expect("temp dir");
        let target = directory.path().join("missing").join("note.md");

        let result = write_atomic(&target, b"x");

        assert!(result.is_err());
        assert!(!directory.path().join("missing").exists());
    }

    #[test]
    fn a_path_without_a_parent_is_rejected() {
        let result = write_atomic(Path::new(""), b"x");

        assert!(matches!(result, Err(AppError::Validation(_))));
    }

    #[test]
    fn temporary_files_are_recognized_by_name() {
        assert!(is_temp_file(Path::new("/vault/.orbit-tmp-123")));
        assert!(!is_temp_file(Path::new("/vault/note.md")));
        assert!(!is_temp_file(Path::new("/vault/")));
    }

    #[test]
    fn preserves_non_ascii_content_byte_for_byte() {
        let directory = tempfile::tempdir().expect("temp dir");
        let target = directory.path().join("nota.md");
        let content = "# Acentuação — 日本語\n".as_bytes();

        write_atomic(&target, content).expect("writes");

        assert_eq!(fs::read(&target).expect("reads"), content);
    }
}
