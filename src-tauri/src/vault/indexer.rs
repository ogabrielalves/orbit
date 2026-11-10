use std::fs;
use std::path::Path;
use std::time::SystemTime;

use chrono::{DateTime, Utc};

use super::frontmatter;
use super::title::title_of;
use super::writer::is_temp_file;
use crate::shared::time;

pub const ATTACHMENTS_DIRECTORY: &str = "attachments";
pub const MAX_NOTE_BYTES: u64 = 10 * 1024 * 1024;
const UNTITLED: &str = "Untitled";

pub fn scan(vault_root: &Path) -> Vec<String> {
    let mut found = Vec::new();
    collect(vault_root, "", &mut found);
    found.sort();
    found
}

pub fn list_directories(vault_root: &Path) -> Vec<String> {
    let mut found = Vec::new();
    collect_directories(vault_root, "", &mut found);
    found.sort_by_key(|path| path.to_lowercase());
    found
}

fn collect_directories(directory: &Path, prefix: &str, found: &mut Vec<String>) {
    let Ok(entries) = fs::read_dir(directory) else {
        return;
    };
    for entry in entries.flatten() {
        let Some(name) = entry.file_name().to_str().map(str::to_string) else {
            continue;
        };
        let Ok(file_type) = entry.file_type() else {
            continue;
        };
        let is_visible_directory =
            file_type.is_dir() && !file_type.is_symlink() && !name.starts_with('.');
        let is_attachments_root = prefix.is_empty() && name == ATTACHMENTS_DIRECTORY;
        if !is_visible_directory || is_attachments_root {
            continue;
        }
        let path = if prefix.is_empty() {
            name
        } else {
            format!("{prefix}/{name}")
        };
        collect_directories(&entry.path(), &path, found);
        found.push(path);
    }
}

pub fn is_indexable_path(relative_path: &str) -> bool {
    let segments: Vec<&str> = relative_path.split('/').collect();
    let has_hidden_segment = segments
        .iter()
        .any(|segment| segment.is_empty() || segment.starts_with('.'));
    let in_attachments = segments.len() > 1 && segments[0] == ATTACHMENTS_DIRECTORY;
    let is_markdown = Path::new(relative_path)
        .extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case("md"));
    is_markdown && !has_hidden_segment && !in_attachments && !is_temp_file(Path::new(relative_path))
}

pub fn to_relative(vault_root: &Path, absolute: &Path) -> Option<String> {
    let relative = absolute.strip_prefix(vault_root).ok()?;
    let parts: Option<Vec<&str>> = relative.iter().map(|part| part.to_str()).collect();
    let joined = parts?.join("/");
    (!joined.is_empty()).then_some(joined)
}

fn collect(directory: &Path, prefix: &str, found: &mut Vec<String>) {
    let Ok(entries) = fs::read_dir(directory) else {
        log::warn!("could not read directory '{}'", directory.display());
        return;
    };
    for entry in entries.flatten() {
        let Some(name) = entry.file_name().to_str().map(str::to_string) else {
            continue;
        };
        let Ok(file_type) = entry.file_type() else {
            continue;
        };
        let relative = if prefix.is_empty() {
            name.clone()
        } else {
            format!("{prefix}/{name}")
        };
        if file_type.is_symlink() || name.starts_with('.') {
            continue;
        }
        if file_type.is_dir() {
            let is_attachments_root = prefix.is_empty() && name == ATTACHMENTS_DIRECTORY;
            if !is_attachments_root {
                collect(&entry.path(), &relative, found);
            }
        } else if is_indexable_path(&relative) {
            found.push(relative);
        }
    }
}

pub fn same_file(vault_root: &Path, first: &str, second: &str) -> bool {
    let resolve = |relative: &str| fs::canonicalize(vault_root.join(relative)).ok();
    match (resolve(first), resolve(second)) {
        (Some(left), Some(right)) => left == right,
        _ => false,
    }
}

pub fn file_claims_id(vault_root: &Path, relative_path: &str, wanted_id: &str) -> bool {
    let Ok(text) = fs::read_to_string(vault_root.join(relative_path)) else {
        return false;
    };
    frontmatter::parse(&text).frontmatter.id.as_deref() == Some(wanted_id)
}

pub fn is_valid_id(candidate: &str) -> bool {
    let is_empty = candidate.is_empty();
    let has_whitespace = candidate.chars().any(char::is_whitespace);
    !is_empty && !has_whitespace && candidate.len() <= 64
}

pub fn note_title(body: &str, relative_path: &str) -> String {
    let stem = Path::new(relative_path)
        .file_stem()
        .and_then(|stem| stem.to_str())
        .unwrap_or(UNTITLED);
    let title = title_of(body, stem);
    if title.trim().is_empty() {
        return UNTITLED.to_string();
    }
    title
}

pub fn modified_time(metadata: &fs::Metadata) -> String {
    metadata
        .modified()
        .ok()
        .map(|moment: SystemTime| time::format(DateTime::<Utc>::from(moment)))
        .unwrap_or_else(time::now)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn write_file(root: &Path, relative: &str, content: &str) {
        let path = root.join(relative);
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).expect("creates dirs");
        }
        fs::write(path, content).expect("writes");
    }

    #[test]
    fn indexable_paths_follow_the_scan_rules() {
        for good in [
            "a.md",
            "dir/a.md",
            "UPPER.MD",
            "folder/attachments/a.md",
            "attachments.md",
        ] {
            assert!(is_indexable_path(good), "{good} should be indexable");
        }
        for bad in [
            "a.txt",
            "dir/.hidden/a.md",
            ".a.md",
            "attachments/a.md",
            ".orbit-tmp-1",
            "dir//a.md",
            "",
            "noextension",
        ] {
            assert!(!is_indexable_path(bad), "{bad} should not be indexable");
        }
    }

    #[test]
    fn relative_paths_use_forward_slashes_and_must_lie_inside_the_vault() {
        let root = Path::new("vault");
        let inside = root.join("dir").join("a.md");

        assert_eq!(to_relative(root, &inside).as_deref(), Some("dir/a.md"));
        assert_eq!(to_relative(root, root), None);
        assert_eq!(to_relative(root, Path::new("elsewhere/a.md")), None);
    }

    #[test]
    fn scanning_an_empty_or_missing_vault_finds_nothing() {
        let vault = tempfile::tempdir().expect("vault");

        assert!(scan(vault.path()).is_empty());
        assert!(scan(&vault.path().join("ghost")).is_empty());
    }

    #[test]
    fn scanning_skips_hidden_entries_attachments_temp_files_and_other_extensions() {
        let vault = tempfile::tempdir().expect("vault");
        for relative in [
            "note.md",
            ".hidden/secret.md",
            ".dotfile.md",
            "attachments/image-notes.md",
            "folder/attachments/inner.md",
            "readme.txt",
            ".orbit-tmp-123",
            "UPPER.MD",
            "deep/er/nested.md",
        ] {
            write_file(vault.path(), relative, "# x\n");
        }

        let found = scan(vault.path());

        assert_eq!(
            found,
            [
                "UPPER.MD",
                "deep/er/nested.md",
                "folder/attachments/inner.md",
                "note.md"
            ]
        );
    }

    #[test]
    fn valid_ids_are_non_empty_without_whitespace_and_short() {
        assert!(is_valid_id("01933b6e-6b0e-7c4a-9f3e-2a4d1c8e5f10"));
        assert!(is_valid_id("fixed-id"));
        assert!(!is_valid_id(""));
        assert!(!is_valid_id("has spaces"));
        assert!(!is_valid_id("tab\there"));
        assert!(!is_valid_id(&"x".repeat(65)));
        assert!(is_valid_id(&"x".repeat(64)));
    }

    #[test]
    fn titles_come_from_the_heading_then_the_file_name_then_a_default() {
        assert_eq!(note_title("# Heading\n", "dir/file.md"), "Heading");
        assert_eq!(
            note_title("no heading\n", "dir/Spring Boot.md"),
            "Spring Boot"
        );
        assert_eq!(note_title("", "日本語.md"), "日本語");
        assert_eq!(note_title("# \n", ""), "Untitled");
    }

    #[test]
    fn a_file_claims_an_id_only_when_its_frontmatter_has_it() {
        let vault = tempfile::tempdir().expect("vault");
        write_file(vault.path(), "a.md", "---\nid: abc\n---\n# A\n");
        write_file(vault.path(), "b.md", "# no frontmatter\n");

        assert!(file_claims_id(vault.path(), "a.md", "abc"));
        assert!(!file_claims_id(vault.path(), "a.md", "other"));
        assert!(!file_claims_id(vault.path(), "b.md", "abc"));
        assert!(!file_claims_id(vault.path(), "ghost.md", "abc"));
    }

    #[test]
    fn the_same_file_check_tells_aliases_from_different_files() {
        let vault = tempfile::tempdir().expect("vault");
        write_file(vault.path(), "a.md", "x");
        write_file(vault.path(), "b.md", "x");

        assert!(same_file(vault.path(), "a.md", "a.md"));
        assert!(!same_file(vault.path(), "a.md", "b.md"));
        assert!(!same_file(vault.path(), "a.md", "ghost.md"));
        let is_case_insensitive = vault.path().join("A.MD").exists();
        if is_case_insensitive {
            assert!(same_file(vault.path(), "a.md", "A.MD"));
        }
    }

    #[test]
    fn modification_times_are_iso_timestamps() {
        let vault = tempfile::tempdir().expect("vault");
        write_file(vault.path(), "a.md", "x");
        let metadata = fs::metadata(vault.path().join("a.md")).expect("metadata");

        let stamp = modified_time(&metadata);

        assert!(stamp.ends_with('Z'), "{stamp}");
        assert_eq!(stamp.len(), "2026-11-08T10:00:00.000Z".len());
    }

    #[test]
    fn listing_directories_skips_hidden_symlinks_attachments_and_files_and_sorts_ignoring_case() {
        let vault = tempfile::tempdir().expect("vault");
        for relative in [
            "b/inner/x.md",
            "A/y.md",
            ".hidden/z.md",
            "attachments/img.png",
            "c/attachments/keep.md",
            "plain.md",
        ] {
            write_file(vault.path(), relative, "x");
        }

        let found = list_directories(vault.path());

        assert_eq!(found, ["A", "b", "b/inner", "c", "c/attachments"]);
        assert!(list_directories(&vault.path().join("ghost")).is_empty());
    }
}
