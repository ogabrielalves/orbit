use std::collections::{BTreeMap, HashSet};
use std::fs;
use std::path::Path;

use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use specta::Type;

use super::models::{LinkRecord, NoteRecord};
use super::repository;
use crate::error::{AppError, AppResult};
use crate::modules::search::repository as search_repository;
use crate::shared::id;
use crate::vault::frontmatter;
use crate::vault::hash::content_hash;
use crate::vault::indexer::{
    MAX_NOTE_BYTES, file_claims_id, is_valid_id, list_directories, modified_time, note_title,
    same_file, scan,
};
use crate::vault::links::{self, title_key};
use crate::vault::watcher::ChangeBatch;
use crate::vault::writer;

#[derive(Debug, Default, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct IndexReport {
    pub added: u32,
    pub updated: u32,
    pub unchanged: u32,
    pub removed: u32,
    /// Notes that had no usable `id` (or a duplicated one) and got a new one written to the file.
    pub ids_assigned: u32,
    /// Files that could not be indexed (not UTF-8, too large, unreadable), by relative path.
    pub skipped: Vec<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FileOutcome {
    Unchanged,
    Added,
    Updated,
    Skipped,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Indexed {
    pub outcome: FileOutcome,
    pub id_assigned: bool,
}

impl Indexed {
    fn new(outcome: FileOutcome) -> Self {
        Self {
            outcome,
            id_assigned: false,
        }
    }
}

/// Makes the index match the vault: indexes new and changed notes, follows moved ones by `id`,
/// and drops rows whose file is gone. Runs in a single transaction.
pub fn reconcile(connection: &mut Connection, vault_root: &Path) -> AppResult<IndexReport> {
    let files = scan(vault_root);
    let on_disk: HashSet<&str> = files.iter().map(String::as_str).collect();
    let transaction = connection.transaction()?;
    let mut report = IndexReport::default();

    for relative_path in &files {
        match index_file(&transaction, vault_root, relative_path) {
            Ok(indexed) => count(&mut report, indexed, relative_path),
            Err(error @ (AppError::Database | AppError::Internal)) => return Err(error),
            Err(error) => {
                log::warn!("could not index '{relative_path}': {error}");
                report.skipped.push(relative_path.clone());
            }
        }
    }

    for note in repository::list_all(&transaction)? {
        let is_gone = !on_disk.contains(note.path.as_str());
        if is_gone {
            repository::delete(&transaction, &note.id)?;
            report.removed += 1;
        }
    }
    search_repository::replace_folders(&transaction, &list_directories(vault_root))?;
    transaction.commit()?;
    Ok(report)
}

fn count(report: &mut IndexReport, indexed: Indexed, relative_path: &str) {
    match indexed.outcome {
        FileOutcome::Unchanged => report.unchanged += 1,
        FileOutcome::Added => report.added += 1,
        FileOutcome::Updated => report.updated += 1,
        FileOutcome::Skipped => report.skipped.push(relative_path.to_string()),
    }
    if indexed.id_assigned {
        report.ids_assigned += 1;
    }
}

/// Indexes one file (path relative to the vault, `/` separated). Writes an `id` into the file's
/// frontmatter when it has none, or when another note already uses the same one.
pub fn index_file(
    connection: &Connection,
    vault_root: &Path,
    relative_path: &str,
) -> AppResult<Indexed> {
    let absolute = vault_root.join(relative_path);
    let Some(metadata) = fs::metadata(&absolute).ok().filter(fs::Metadata::is_file) else {
        return Ok(Indexed::new(FileOutcome::Skipped));
    };
    let is_too_large = metadata.len() > MAX_NOTE_BYTES;
    if is_too_large {
        return Ok(Indexed::new(FileOutcome::Skipped));
    }
    let bytes = fs::read(&absolute)?;
    let hash = content_hash(&bytes);

    let at_path = repository::find_by_path(connection, relative_path)?;
    let has_same_content = at_path.as_ref().is_some_and(|note| note.hash == hash);
    let is_searchable = match &at_path {
        Some(note) if has_same_content => {
            search_repository::has_entry(connection, search_repository::NOTE, &note.id)?
        }
        _ => false,
    };
    if has_same_content && is_searchable {
        return Ok(Indexed::new(FileOutcome::Unchanged));
    }

    let Ok(text) = String::from_utf8(bytes) else {
        return Ok(Indexed::new(FileOutcome::Skipped));
    };
    let parsed = frontmatter::parse(&text);
    let (note_id, id_assigned) = resolve_id(
        connection,
        vault_root,
        relative_path,
        parsed.frontmatter.id.as_deref(),
    )?;

    let existing = repository::find_by_id(connection, &note_id)?;
    let mut note_frontmatter = parsed.frontmatter.clone();
    let (final_hash, modified_at) = if id_assigned {
        note_frontmatter.id = Some(note_id.clone());
        if note_frontmatter.created.is_none() {
            note_frontmatter.created = Some(modified_time(&metadata));
        }
        let rewritten = frontmatter::render(&note_frontmatter, &parsed.body);
        writer::write_atomic(&absolute, rewritten.as_bytes())?;
        let new_metadata = fs::metadata(&absolute)?;
        (
            content_hash(rewritten.as_bytes()),
            modified_time(&new_metadata),
        )
    } else {
        (hash, modified_time(&metadata))
    };

    let title = note_title(&parsed.body, relative_path);
    let created_at = note_frontmatter
        .created
        .clone()
        .or_else(|| existing.as_ref().map(|note| note.created_at.clone()))
        .unwrap_or_else(|| modified_at.clone());
    let record = NoteRecord {
        id: note_id.clone(),
        path: relative_path.to_string(),
        title_key: title_key(&title),
        title,
        hash: final_hash,
        created_at,
        modified_at,
    };

    // A different note recorded at this path means the file's identity changed on disk.
    if let Some(occupant) = at_path.filter(|note| note.id != note_id) {
        repository::delete(connection, &occupant.id)?;
    }
    let outcome = match existing {
        Some(_) => {
            repository::update(connection, &record)?;
            FileOutcome::Updated
        }
        None => {
            repository::insert(connection, &record)?;
            FileOutcome::Added
        }
    };
    repository::replace_links(connection, &note_id, &link_records(&parsed.body))?;
    search_repository::upsert_entry(
        connection,
        search_repository::NOTE,
        &note_id,
        &record.title,
        &parsed.body,
    )?;
    Ok(Indexed {
        outcome,
        id_assigned,
    })
}

/// Forgets the note stored at `relative_path`. Returns whether there was one.
pub fn remove_file(connection: &Connection, relative_path: &str) -> AppResult<bool> {
    match repository::find_by_path(connection, relative_path)? {
        Some(note) => Ok(repository::delete(connection, &note.id)? > 0),
        None => Ok(false),
    }
}

/// Decides the note id for a file. The id written in the file wins, unless another note that
/// still claims it on disk already owns it (a copied file), in which case a new one is generated.
/// An owner whose file no longer carries the id has moved to this path (or swapped with it).
fn resolve_id(
    connection: &Connection,
    vault_root: &Path,
    relative_path: &str,
    from_file: Option<&str>,
) -> AppResult<(String, bool)> {
    let candidate = from_file.filter(|candidate| is_valid_id(candidate));
    let Some(candidate) = candidate else {
        return Ok((id::new_id(), true));
    };
    let owner = repository::find_by_id(connection, candidate)?;
    let Some(owner) = owner else {
        return Ok((candidate.to_string(), false));
    };
    let owns_this_path = owner.path == relative_path;
    let is_the_same_file = same_file(vault_root, &owner.path, relative_path);
    if owns_this_path || is_the_same_file || !file_claims_id(vault_root, &owner.path, candidate) {
        return Ok((candidate.to_string(), false));
    }
    Ok((id::new_id(), true))
}

fn link_records(body: &str) -> Vec<LinkRecord> {
    let mut grouped: BTreeMap<String, LinkRecord> = BTreeMap::new();
    for link in links::extract(body) {
        let key = title_key(&link.target);
        grouped
            .entry(key.clone())
            .and_modify(|record| record.link_count += 1)
            .or_insert(LinkRecord {
                target_key: key,
                target_title: link.target,
                link_count: 1,
            });
    }
    grouped.into_values().collect()
}

/// Applies a batch to the index in one transaction: changed and new notes are indexed first (so
/// a moved note is recognized by its id), and only then are the vanished paths forgotten.
pub fn apply_changes(
    connection: &mut Connection,
    vault_root: &Path,
    batch: &ChangeBatch,
) -> AppResult<IndexReport> {
    if batch.needs_full_scan {
        return reconcile(connection, vault_root);
    }

    let transaction = connection.transaction()?;
    let mut report = IndexReport::default();
    let mut vanished = Vec::new();
    for relative in &batch.files {
        let is_present = vault_root.join(relative).is_file();
        if !is_present {
            vanished.push(relative);
            continue;
        }
        match index_file(&transaction, vault_root, relative) {
            Ok(indexed) => {
                match indexed.outcome {
                    FileOutcome::Added => report.added += 1,
                    FileOutcome::Updated => report.updated += 1,
                    FileOutcome::Unchanged => report.unchanged += 1,
                    FileOutcome::Skipped => report.skipped.push(relative.clone()),
                }
                if indexed.id_assigned {
                    report.ids_assigned += 1;
                }
            }
            Err(error @ (AppError::Database | AppError::Internal)) => return Err(error),
            Err(error) => {
                log::warn!("could not index '{relative}': {error}");
                report.skipped.push(relative.clone());
            }
        }
    }
    for relative in vanished {
        if remove_file(&transaction, relative)? {
            report.removed += 1;
        }
    }
    transaction.commit()?;
    Ok(report)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{connection::open_in_memory, migrations};

    fn database() -> Connection {
        let mut connection = open_in_memory().expect("opens");
        migrations::run(&mut connection).expect("migrates");
        connection
    }

    fn write(root: &Path, relative: &str, content: &str) {
        let path = root.join(relative);
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).expect("creates dirs");
        }
        fs::write(path, content).expect("writes");
    }

    fn read(root: &Path, relative: &str) -> String {
        fs::read_to_string(root.join(relative)).expect("reads")
    }

    fn note_at(connection: &Connection, path: &str) -> NoteRecord {
        repository::find_by_path(connection, path)
            .expect("reads")
            .unwrap_or_else(|| panic!("no note at {path}"))
    }

    fn paths(connection: &Connection) -> Vec<String> {
        repository::list_all(connection)
            .expect("lists")
            .into_iter()
            .map(|note| note.path)
            .collect()
    }

    fn with_id(id: &str, body: &str) -> String {
        format!("---\nid: {id}\ncreated: 2026-01-01T00:00:00Z\n---\n{body}")
    }

    fn batch_of(paths: &[&str]) -> ChangeBatch {
        ChangeBatch {
            files: paths.iter().map(|path| path.to_string()).collect(),
            needs_full_scan: false,
        }
    }

    #[test]
    fn a_fresh_vault_is_indexed_and_notes_without_ids_get_one_written_into_the_file() {
        let vault = tempfile::tempdir().expect("vault");
        let mut connection = database();
        write(vault.path(), "plain.md", "# Plain note\n\nSee [[Other]].\n");
        write(vault.path(), "Folder/deep.md", "no heading here\n");

        let report = reconcile(&mut connection, vault.path()).expect("reconciles");

        assert_eq!((report.added, report.updated, report.removed), (2, 0, 0));
        assert_eq!(report.ids_assigned, 2);
        assert_eq!(paths(&connection), ["Folder/deep.md", "plain.md"]);
        let plain = note_at(&connection, "plain.md");
        assert_eq!(plain.title, "Plain note");
        let rewritten = read(vault.path(), "plain.md");
        assert!(rewritten.starts_with(&format!("---\nid: {}\ncreated: ", plain.id)));
        assert!(rewritten.ends_with("---\n# Plain note\n\nSee [[Other]].\n"));
        assert_eq!(plain.hash, content_hash(rewritten.as_bytes()));
        assert_eq!(note_at(&connection, "Folder/deep.md").title, "deep");
    }

    #[test]
    fn a_note_that_already_has_an_id_is_left_byte_for_byte_untouched() {
        let vault = tempfile::tempdir().expect("vault");
        let mut connection = database();
        let content = with_id("fixed-id", "# Keep\n");
        write(vault.path(), "keep.md", &content);

        let report = reconcile(&mut connection, vault.path()).expect("reconciles");

        assert_eq!(report.ids_assigned, 0);
        assert_eq!(read(vault.path(), "keep.md"), content);
        let note = note_at(&connection, "keep.md");
        assert_eq!(note.id, "fixed-id");
        assert_eq!(note.created_at, "2026-01-01T00:00:00Z");
        assert_eq!(note.hash, content_hash(content.as_bytes()));
    }

    #[test]
    fn indexing_twice_changes_nothing_and_writes_no_files() {
        let vault = tempfile::tempdir().expect("vault");
        let mut connection = database();
        write(vault.path(), "a.md", "# A\n");
        reconcile(&mut connection, vault.path()).expect("first run");
        let after_first = read(vault.path(), "a.md");
        let before = repository::list_all(&connection).expect("lists");

        let report = reconcile(&mut connection, vault.path()).expect("second run");

        assert_eq!((report.added, report.updated, report.unchanged), (0, 0, 1));
        assert_eq!(report.ids_assigned, 0);
        assert_eq!(read(vault.path(), "a.md"), after_first);
        assert_eq!(repository::list_all(&connection).expect("lists"), before);
    }

    #[test]
    fn an_edit_made_outside_the_app_updates_title_hash_and_links() {
        let vault = tempfile::tempdir().expect("vault");
        let mut connection = database();
        write(vault.path(), "n.md", &with_id("n1", "# Old title\n[[A]]\n"));
        reconcile(&mut connection, vault.path()).expect("first run");
        let before = note_at(&connection, "n.md");

        write(
            vault.path(),
            "n.md",
            &with_id("n1", "# New title\n[[B]] [[b]]\n"),
        );
        let report = reconcile(&mut connection, vault.path()).expect("second run");

        assert_eq!((report.updated, report.added), (1, 0));
        let after = note_at(&connection, "n.md");
        assert_eq!(after.id, before.id);
        assert_eq!(after.title, "New title");
        assert_ne!(after.hash, before.hash);
        let links = repository::list_links(&connection, "n1").expect("lists");
        assert_eq!(links.len(), 1);
        assert_eq!(
            (links[0].target_key.as_str(), links[0].link_count),
            ("b", 2)
        );
        assert_eq!(links[0].target_title, "B");
    }

    #[test]
    fn links_are_grouped_by_normalized_target_and_ignore_code() {
        let vault = tempfile::tempdir().expect("vault");
        let mut connection = database();
        let body = "# T\n[[Spring Boot]] [[spring   boot|alias]] [[Hibernate#Part]]\n`[[Code]]`\n```\n[[Fenced]]\n```\n";
        write(vault.path(), "t.md", &with_id("t1", body));

        reconcile(&mut connection, vault.path()).expect("reconciles");

        let links = repository::list_links(&connection, "t1").expect("lists");
        let summary: Vec<(&str, u32)> = links
            .iter()
            .map(|link| (link.target_key.as_str(), link.link_count))
            .collect();
        assert_eq!(summary, [("hibernate", 1), ("spring boot", 2)]);
    }

    #[test]
    fn a_moved_file_keeps_its_identity_and_links() {
        let vault = tempfile::tempdir().expect("vault");
        let mut connection = database();
        write(
            vault.path(),
            "old/place.md",
            &with_id("m1", "# Moved\n[[X]]\n"),
        );
        reconcile(&mut connection, vault.path()).expect("first run");

        fs::create_dir_all(vault.path().join("new")).expect("creates dir");
        fs::rename(
            vault.path().join("old/place.md"),
            vault.path().join("new/renamed.md"),
        )
        .expect("moves");
        let report = reconcile(&mut connection, vault.path()).expect("second run");

        assert_eq!((report.updated, report.added, report.removed), (1, 0, 0));
        assert_eq!(paths(&connection), ["new/renamed.md"]);
        assert_eq!(note_at(&connection, "new/renamed.md").id, "m1");
        assert_eq!(
            repository::list_links(&connection, "m1")
                .expect("lists")
                .len(),
            1
        );
    }

    #[test]
    fn a_copied_file_gets_a_new_id_and_the_original_keeps_its_own() {
        let vault = tempfile::tempdir().expect("vault");
        let mut connection = database();
        write(
            vault.path(),
            "z-original.md",
            &with_id("shared", "# Note\n"),
        );
        reconcile(&mut connection, vault.path()).expect("first run");

        // "a-copy.md" sorts before the original, which must not matter
        fs::copy(
            vault.path().join("z-original.md"),
            vault.path().join("a-copy.md"),
        )
        .expect("copies");
        let report = reconcile(&mut connection, vault.path()).expect("second run");

        assert_eq!((report.added, report.ids_assigned), (1, 1));
        assert_eq!(note_at(&connection, "z-original.md").id, "shared");
        let copy = note_at(&connection, "a-copy.md");
        assert_ne!(copy.id, "shared");
        assert!(read(vault.path(), "a-copy.md").contains(&format!("id: {}", copy.id)));
        assert_eq!(
            read(vault.path(), "z-original.md"),
            with_id("shared", "# Note\n")
        );
    }

    #[test]
    fn two_files_with_the_same_id_in_a_fresh_index_resolve_by_path_order() {
        let vault = tempfile::tempdir().expect("vault");
        let mut connection = database();
        write(vault.path(), "a.md", &with_id("dup", "# A\n"));
        write(vault.path(), "b.md", &with_id("dup", "# B\n"));

        let report = reconcile(&mut connection, vault.path()).expect("reconciles");

        assert_eq!((report.added, report.ids_assigned), (2, 1));
        assert_eq!(note_at(&connection, "a.md").id, "dup");
        assert_ne!(note_at(&connection, "b.md").id, "dup");
    }

    #[test]
    fn a_deleted_file_removes_its_row_and_outgoing_links() {
        let vault = tempfile::tempdir().expect("vault");
        let mut connection = database();
        write(vault.path(), "gone.md", &with_id("g1", "# Gone\n[[X]]\n"));
        write(vault.path(), "stays.md", &with_id("s1", "# Stays\n"));
        reconcile(&mut connection, vault.path()).expect("first run");

        fs::remove_file(vault.path().join("gone.md")).expect("removes");
        let report = reconcile(&mut connection, vault.path()).expect("second run");

        assert_eq!(report.removed, 1);
        assert_eq!(paths(&connection), ["stays.md"]);
        assert!(
            repository::list_links(&connection, "g1")
                .expect("lists")
                .is_empty()
        );
    }

    #[test]
    fn two_notes_that_swap_paths_keep_their_identities() {
        let vault = tempfile::tempdir().expect("vault");
        let mut connection = database();
        write(vault.path(), "one.md", &with_id("id-one", "# One\n"));
        write(vault.path(), "two.md", &with_id("id-two", "# Two\n"));
        reconcile(&mut connection, vault.path()).expect("first run");

        fs::rename(vault.path().join("one.md"), vault.path().join("tmp.md")).expect("moves");
        fs::rename(vault.path().join("two.md"), vault.path().join("one.md")).expect("moves");
        fs::rename(vault.path().join("tmp.md"), vault.path().join("two.md")).expect("moves");
        reconcile(&mut connection, vault.path()).expect("second run");

        assert_eq!(note_at(&connection, "one.md").id, "id-two");
        assert_eq!(note_at(&connection, "two.md").id, "id-one");
        assert_eq!(paths(&connection).len(), 2);
    }

    #[test]
    fn deleting_the_database_and_reindexing_restores_the_same_ids() {
        let vault = tempfile::tempdir().expect("vault");
        let mut first = database();
        write(vault.path(), "a.md", "# A\n");
        write(vault.path(), "b/c.md", &with_id("fixed", "# C\n"));
        reconcile(&mut first, vault.path()).expect("first run");
        let ids_before: Vec<String> = repository::list_all(&first)
            .expect("lists")
            .into_iter()
            .map(|note| note.id)
            .collect();

        let mut rebuilt = database();
        let report = reconcile(&mut rebuilt, vault.path()).expect("rebuilds");

        let ids_after: Vec<String> = repository::list_all(&rebuilt)
            .expect("lists")
            .into_iter()
            .map(|note| note.id)
            .collect();
        assert_eq!(ids_after, ids_before);
        assert_eq!((report.added, report.ids_assigned), (2, 0));
    }

    #[test]
    fn hidden_entries_attachments_temp_files_and_other_extensions_are_ignored() {
        let vault = tempfile::tempdir().expect("vault");
        let mut connection = database();
        write(vault.path(), "note.md", "# Note\n");
        write(vault.path(), ".hidden/secret.md", "# Secret\n");
        write(vault.path(), ".dotfile.md", "# Dot\n");
        write(vault.path(), "attachments/image-notes.md", "# Not a note\n");
        write(
            vault.path(),
            "folder/attachments/inner.md",
            "# Inner is a note\n",
        );
        write(vault.path(), "readme.txt", "text\n");
        write(vault.path(), ".orbit-tmp-123", "partial\n");
        write(vault.path(), "UPPER.MD", "# Upper\n");

        reconcile(&mut connection, vault.path()).expect("reconciles");

        assert_eq!(
            paths(&connection),
            ["UPPER.MD", "folder/attachments/inner.md", "note.md"]
        );
    }

    #[test]
    fn files_that_are_not_utf8_or_too_large_are_skipped_without_aborting() {
        let vault = tempfile::tempdir().expect("vault");
        let mut connection = database();
        write(vault.path(), "good.md", "# Good\n");
        fs::write(vault.path().join("binary.md"), [0xff, 0xfe, 0x00, 0x80]).expect("writes");
        let huge = vec![b'a'; (MAX_NOTE_BYTES + 1) as usize];
        fs::write(vault.path().join("huge.md"), huge).expect("writes");

        let report = reconcile(&mut connection, vault.path()).expect("reconciles");

        assert_eq!(report.added, 1);
        assert_eq!(report.skipped, ["binary.md", "huge.md"]);
        assert_eq!(paths(&connection), ["good.md"]);
    }

    #[test]
    fn an_invalid_id_in_the_frontmatter_is_replaced() {
        let vault = tempfile::tempdir().expect("vault");
        let mut connection = database();
        write(
            vault.path(),
            "bad.md",
            "---\nid: has spaces in it\n---\n# Bad\n",
        );

        let report = reconcile(&mut connection, vault.path()).expect("reconciles");

        assert_eq!(report.ids_assigned, 1);
        let note = note_at(&connection, "bad.md");
        assert!(!note.id.contains(' '));
        assert!(read(vault.path(), "bad.md").contains(&format!("id: {}", note.id)));
    }

    #[test]
    fn other_frontmatter_keys_and_the_body_survive_the_id_assignment() {
        let vault = tempfile::tempdir().expect("vault");
        let mut connection = database();
        let original =
            "---\naliases:\n  - First\ncolor: red\ntags: [a, b]\n---\n# Keep me\n\nbody text\n";
        write(vault.path(), "k.md", original);

        reconcile(&mut connection, vault.path()).expect("reconciles");

        let rewritten = read(vault.path(), "k.md");
        let parsed = frontmatter::parse(&rewritten);
        assert_eq!(parsed.frontmatter.tags, ["a", "b"]);
        assert!(rewritten.contains("aliases:\n  - First\ncolor: red\n"));
        assert!(rewritten.ends_with("---\n# Keep me\n\nbody text\n"));
        assert!(parsed.frontmatter.id.is_some());
        assert!(parsed.frontmatter.created.is_some());
    }

    #[test]
    fn crlf_bodies_are_preserved_when_the_id_is_added() {
        let vault = tempfile::tempdir().expect("vault");
        let mut connection = database();
        write(vault.path(), "w.md", "# Windows\r\n\r\ntext\r\n");

        reconcile(&mut connection, vault.path()).expect("reconciles");

        assert!(read(vault.path(), "w.md").ends_with("---\n# Windows\r\n\r\ntext\r\n"));
        assert_eq!(note_at(&connection, "w.md").title, "Windows");
    }

    #[test]
    fn unicode_names_and_titles_are_indexed() {
        let vault = tempfile::tempdir().expect("vault");
        let mut connection = database();
        write(vault.path(), "Anotações/Ação rápida.md", "sem título\n");
        write(vault.path(), "日本語.md", "# 日本語のノート\n");

        reconcile(&mut connection, vault.path()).expect("reconciles");

        assert_eq!(
            note_at(&connection, "Anotações/Ação rápida.md").title,
            "Ação rápida"
        );
        assert_eq!(note_at(&connection, "日本語.md").title, "日本語のノート");
        assert_eq!(
            note_at(&connection, "日本語.md").title_key,
            "日本語のノート"
        );
    }

    #[test]
    fn a_file_replaced_by_another_notes_content_evicts_the_old_row() {
        let vault = tempfile::tempdir().expect("vault");
        let mut connection = database();
        write(vault.path(), "slot.md", &with_id("old", "# Old\n"));
        reconcile(&mut connection, vault.path()).expect("first run");

        write(vault.path(), "slot.md", &with_id("replacement", "# New\n"));
        reconcile(&mut connection, vault.path()).expect("second run");

        assert_eq!(paths(&connection), ["slot.md"]);
        assert_eq!(note_at(&connection, "slot.md").id, "replacement");
        assert_eq!(
            repository::find_by_id(&connection, "old").expect("reads"),
            None
        );
    }

    #[test]
    fn single_file_indexing_reports_added_updated_unchanged_and_skipped() {
        let vault = tempfile::tempdir().expect("vault");
        let connection = database();
        write(vault.path(), "a.md", &with_id("a1", "# A\n"));

        let added = index_file(&connection, vault.path(), "a.md").expect("indexes");
        let unchanged = index_file(&connection, vault.path(), "a.md").expect("indexes");
        write(vault.path(), "a.md", &with_id("a1", "# A changed\n"));
        let updated = index_file(&connection, vault.path(), "a.md").expect("indexes");
        let missing = index_file(&connection, vault.path(), "ghost.md").expect("indexes");

        assert_eq!(added.outcome, FileOutcome::Added);
        assert_eq!(unchanged.outcome, FileOutcome::Unchanged);
        assert_eq!(updated.outcome, FileOutcome::Updated);
        assert_eq!(missing.outcome, FileOutcome::Skipped);
        assert_eq!(note_at(&connection, "a.md").title, "A changed");
    }

    #[test]
    fn remove_file_forgets_the_note_at_that_path() {
        let vault = tempfile::tempdir().expect("vault");
        let connection = database();
        write(vault.path(), "a.md", &with_id("a1", "# A\n"));
        index_file(&connection, vault.path(), "a.md").expect("indexes");

        let removed = remove_file(&connection, "a.md").expect("removes");
        let again = remove_file(&connection, "a.md").expect("removes");

        assert!(removed);
        assert!(!again);
        assert!(paths(&connection).is_empty());
    }

    #[test]
    fn created_at_falls_back_to_the_stored_value_when_the_frontmatter_loses_it() {
        let vault = tempfile::tempdir().expect("vault");
        let connection = database();
        write(vault.path(), "a.md", &with_id("a1", "# A\n"));
        index_file(&connection, vault.path(), "a.md").expect("indexes");

        write(vault.path(), "a.md", "---\nid: a1\n---\n# A edited\n");
        index_file(&connection, vault.path(), "a.md").expect("indexes");

        assert_eq!(
            note_at(&connection, "a.md").created_at,
            "2026-01-01T00:00:00Z"
        );
    }

    #[test]
    fn a_case_only_rename_on_a_case_insensitive_file_system_is_a_move_not_a_copy() {
        let vault = tempfile::tempdir().expect("vault");
        let mut connection = database();
        write(vault.path(), "case note.md", &with_id("c1", "# Case\n"));
        reconcile(&mut connection, vault.path()).expect("first run");
        let is_case_insensitive = vault.path().join("CASE NOTE.md").exists();
        if !is_case_insensitive {
            return;
        }

        fs::rename(
            vault.path().join("case note.md"),
            vault.path().join("Case Note.md"),
        )
        .expect("renames");
        let report = reconcile(&mut connection, vault.path()).expect("second run");

        assert_eq!(report.ids_assigned, 0);
        assert_eq!(paths(&connection), ["Case Note.md"]);
        assert_eq!(note_at(&connection, "Case Note.md").id, "c1");
    }

    #[test]
    fn new_edited_and_deleted_notes_are_applied_to_the_index() {
        let vault = tempfile::tempdir().expect("vault");
        let mut connection = database();
        write(vault.path(), "keep.md", &with_id("k1", "# Keep\n"));
        write(vault.path(), "gone.md", &with_id("g1", "# Gone\n"));
        reconcile(&mut connection, vault.path()).expect("initial index");

        write(
            vault.path(),
            "keep.md",
            &with_id("k1", "# Keep edited\n[[X]]\n"),
        );
        write(vault.path(), "new.md", &with_id("n1", "# New\n"));
        fs::remove_file(vault.path().join("gone.md")).expect("removes");
        let report = apply_changes(
            &mut connection,
            vault.path(),
            &batch_of(&["keep.md", "new.md", "gone.md"]),
        )
        .expect("applies");

        assert_eq!((report.added, report.updated, report.removed), (1, 1, 1));
        assert_eq!(paths(&connection), ["keep.md", "new.md"]);
        let keep = repository::find_by_path(&connection, "keep.md")
            .expect("reads")
            .expect("exists");
        assert_eq!(keep.title, "Keep edited");
        assert_eq!(
            repository::list_links(&connection, "k1")
                .expect("lists")
                .len(),
            1
        );
    }

    #[test]
    fn a_moved_note_keeps_its_row_because_creations_are_applied_before_removals() {
        let vault = tempfile::tempdir().expect("vault");
        let mut connection = database();
        write(vault.path(), "old.md", &with_id("m1", "# Moved\n[[X]]\n"));
        reconcile(&mut connection, vault.path()).expect("initial index");

        fs::rename(vault.path().join("old.md"), vault.path().join("new.md")).expect("moves");
        let report = apply_changes(
            &mut connection,
            vault.path(),
            &batch_of(&["old.md", "new.md"]),
        )
        .expect("applies");

        assert_eq!((report.updated, report.added, report.removed), (1, 0, 0));
        assert_eq!(paths(&connection), ["new.md"]);
        assert_eq!(
            repository::find_by_path(&connection, "new.md")
                .expect("reads")
                .map(|note| note.id),
            Some("m1".to_string())
        );
        assert_eq!(
            repository::list_links(&connection, "m1")
                .expect("lists")
                .len(),
            1
        );
    }

    #[test]
    fn unchanged_files_and_paths_that_never_were_notes_cost_nothing() {
        let vault = tempfile::tempdir().expect("vault");
        let mut connection = database();
        write(vault.path(), "a.md", &with_id("a1", "# A\n"));
        reconcile(&mut connection, vault.path()).expect("initial index");

        let report = apply_changes(
            &mut connection,
            vault.path(),
            &batch_of(&["a.md", "ghost.md"]),
        )
        .expect("applies");

        assert_eq!(
            (
                report.unchanged,
                report.added,
                report.updated,
                report.removed
            ),
            (1, 0, 0, 0)
        );
        assert_eq!(paths(&connection), ["a.md"]);
    }

    #[test]
    fn a_full_scan_batch_reconciles_the_whole_vault_including_moved_folders() {
        let vault = tempfile::tempdir().expect("vault");
        let mut connection = database();
        write(vault.path(), "old/a.md", &with_id("a1", "# A\n"));
        write(vault.path(), "old/deep/b.md", &with_id("b1", "# B\n"));
        reconcile(&mut connection, vault.path()).expect("initial index");

        fs::rename(vault.path().join("old"), vault.path().join("renamed")).expect("renames");
        let batch = ChangeBatch {
            needs_full_scan: true,
            ..ChangeBatch::default()
        };
        let report = apply_changes(&mut connection, vault.path(), &batch).expect("applies");

        assert_eq!(
            (report.updated, report.removed, report.ids_assigned),
            (2, 0, 0)
        );
        assert_eq!(paths(&connection), ["renamed/a.md", "renamed/deep/b.md"]);
    }

    #[test]
    fn unreadable_notes_are_reported_as_skipped_without_failing_the_batch() {
        let vault = tempfile::tempdir().expect("vault");
        let mut connection = database();
        write(vault.path(), "good.md", &with_id("g1", "# Good\n"));
        fs::write(vault.path().join("binary.md"), [0xff, 0xfe, 0x00, 0x80]).expect("writes");

        let report = apply_changes(
            &mut connection,
            vault.path(),
            &batch_of(&["good.md", "binary.md"]),
        )
        .expect("applies");

        assert_eq!(report.added, 1);
        assert_eq!(report.skipped, ["binary.md"]);
    }
}
