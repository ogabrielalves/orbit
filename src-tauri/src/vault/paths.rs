use std::fs;
use std::path::{Path, PathBuf};

use super::indexer::ATTACHMENTS_DIRECTORY;
use crate::error::{AppError, AppResult};

pub fn normalize_relative(input: &str) -> AppResult<String> {
    let trimmed = input.trim().trim_matches('/');
    if trimmed.is_empty() {
        return Ok(String::new());
    }
    let invalid = || AppError::Validation("invalid path inside the vault".into());
    let segments: Vec<&str> = trimmed.split('/').collect();
    for segment in &segments {
        let is_unsafe = segment.is_empty()
            || *segment == "."
            || *segment == ".."
            || segment.starts_with('.')
            || segment.contains(['\\', ':', '\0']);
        if is_unsafe {
            return Err(invalid());
        }
    }
    if segments[0] == ATTACHMENTS_DIRECTORY {
        return Err(AppError::Validation(format!(
            "'{ATTACHMENTS_DIRECTORY}' is reserved for pasted images"
        )));
    }
    Ok(segments.join("/"))
}

pub fn absolute(root: &Path, relative: &str) -> PathBuf {
    let mut path = root.to_path_buf();
    for segment in relative.split('/').filter(|segment| !segment.is_empty()) {
        path.push(segment);
    }
    path
}

pub fn existing_directory(root: &Path, relative: &str) -> AppResult<PathBuf> {
    let path = absolute(root, relative);
    let metadata = fs::symlink_metadata(&path).map_err(|_| AppError::NotFound("folder".into()))?;
    let is_real_directory = metadata.is_dir() && !metadata.file_type().is_symlink();
    if !is_real_directory {
        return Err(AppError::NotFound("folder".into()));
    }
    Ok(path)
}

pub fn parent_of(relative: &str) -> &str {
    relative.rsplit_once('/').map_or("", |(parent, _)| parent)
}

pub fn name_of(relative: &str) -> &str {
    relative.rsplit_once('/').map_or(relative, |(_, name)| name)
}

pub fn join(parent: &str, name: &str) -> String {
    if parent.is_empty() {
        name.to_string()
    } else {
        format!("{parent}/{name}")
    }
}

pub fn is_same_or_inside(candidate: &str, ancestor: &str) -> bool {
    candidate == ancestor
        || candidate
            .strip_prefix(ancestor)
            .is_some_and(|rest| rest.starts_with('/'))
}

pub fn name_is_taken(directory: &Path, name: &str, except: Option<&Path>) -> bool {
    let wanted = name.to_lowercase();
    let Ok(entries) = fs::read_dir(directory) else {
        return false;
    };
    entries.flatten().any(|entry| {
        let is_the_excepted_entry = except.is_some_and(|path| entry.path() == path);
        let has_same_name = entry.file_name().to_string_lossy().to_lowercase() == wanted;
        has_same_name && !is_the_excepted_entry
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizing_trims_slashes_and_keeps_nested_paths() {
        assert_eq!(normalize_relative(" /a/b/ ").expect("valid"), "a/b");
        assert_eq!(
            normalize_relative("Anotações/Ação").expect("valid"),
            "Anotações/Ação"
        );
        assert_eq!(normalize_relative("").expect("root"), "");
        assert_eq!(normalize_relative("  /  ").expect("root"), "");
    }

    #[test]
    fn traversal_hidden_empty_segments_and_drive_letters_are_rejected() {
        for bad in [
            "../x",
            "a/../b",
            "a/./b",
            "a//b",
            ".hidden",
            "a/.hidden",
            "a\\b",
            "C:/x",
            "a/b:c",
            "a/\0",
        ] {
            assert!(
                normalize_relative(bad).is_err(),
                "{bad:?} should be rejected"
            );
        }
    }

    #[test]
    fn the_attachments_directory_is_reserved_only_at_the_root() {
        assert!(normalize_relative("attachments").is_err());
        assert!(normalize_relative("attachments/images").is_err());
        assert!(normalize_relative("docs/attachments").is_ok());
    }

    #[test]
    fn absolute_joins_every_segment_below_the_root() {
        let root = Path::new("vault");

        assert_eq!(absolute(root, ""), PathBuf::from("vault"));
        assert_eq!(
            absolute(root, "a/b"),
            Path::new("vault").join("a").join("b")
        );
    }

    #[test]
    fn parent_name_and_join_are_consistent() {
        assert_eq!(parent_of("a/b/c"), "a/b");
        assert_eq!(parent_of("a"), "");
        assert_eq!(name_of("a/b/c"), "c");
        assert_eq!(name_of("a"), "a");
        assert_eq!(join("", "x"), "x");
        assert_eq!(join("a/b", "x"), "a/b/x");
    }

    #[test]
    fn inside_checks_respect_segment_boundaries() {
        assert!(is_same_or_inside("a", "a"));
        assert!(is_same_or_inside("a/b", "a"));
        assert!(is_same_or_inside("a/b/c", "a/b"));
        assert!(!is_same_or_inside("ab", "a"));
        assert!(!is_same_or_inside("a", "a/b"));
        assert!(!is_same_or_inside("b/a", "a"));
    }

    #[test]
    fn existing_directory_requires_a_real_directory_inside_the_vault() {
        let vault = tempfile::tempdir().expect("vault");
        fs::create_dir_all(vault.path().join("docs/sub")).expect("creates dirs");
        fs::write(vault.path().join("file.md"), "x").expect("writes");

        assert!(existing_directory(vault.path(), "docs/sub").is_ok());
        assert!(existing_directory(vault.path(), "").is_ok());
        assert!(matches!(
            existing_directory(vault.path(), "ghost"),
            Err(AppError::NotFound(_))
        ));
        assert!(matches!(
            existing_directory(vault.path(), "file.md"),
            Err(AppError::NotFound(_))
        ));
    }

    #[test]
    fn name_collisions_ignore_case_and_skip_the_entry_itself() {
        let vault = tempfile::tempdir().expect("vault");
        fs::create_dir(vault.path().join("Docs")).expect("creates dir");
        fs::write(vault.path().join("note.md"), "x").expect("writes");

        assert!(name_is_taken(vault.path(), "docs", None));
        assert!(name_is_taken(vault.path(), "NOTE.MD", None));
        assert!(!name_is_taken(vault.path(), "other", None));
        assert!(!name_is_taken(
            vault.path(),
            "docs",
            Some(&vault.path().join("Docs"))
        ));
        assert!(!name_is_taken(&vault.path().join("ghost"), "x", None));
    }
}
