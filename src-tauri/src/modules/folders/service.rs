use std::collections::HashMap;
use std::fs;
use std::path::Path;

use rusqlite::Connection;

use super::models::{CreateFolderInput, FolderEntry};
use crate::error::{AppError, AppResult};
use crate::modules::activity::models::{ActivityAction, ChangeSet, EntityType};
use crate::modules::activity::service as activity;
use crate::modules::favorites::repository as favorites_repository;
use crate::modules::notes::repository;
use crate::modules::notes::vault_service::vault_root;
use crate::modules::search::repository as search_repository;
use crate::state::AppState;
use crate::vault::indexer::{ATTACHMENTS_DIRECTORY, list_directories};
use crate::vault::names::validate_name;
use crate::vault::paths::{
    absolute, existing_directory, is_same_or_inside, join, name_is_taken, name_of,
    normalize_relative, parent_of,
};

pub fn list(state: &AppState) -> AppResult<Vec<FolderEntry>> {
    let root = vault_root(state)?;
    let connection = state.database();
    let mut counts: HashMap<String, u32> = HashMap::new();
    for note in repository::list_all(&connection)? {
        *counts.entry(parent_of(&note.path).to_string()).or_insert(0) += 1;
    }

    Ok(list_directories(&root)
        .into_iter()
        .map(|path| FolderEntry {
            name: name_of(&path).to_string(),
            note_count: counts.get(&path).copied().unwrap_or(0),
            path,
        })
        .collect())
}

pub fn create(state: &AppState, input: CreateFolderInput) -> AppResult<FolderEntry> {
    let root = vault_root(state)?;
    let parent = normalize_relative(input.parent_path.as_deref().unwrap_or(""))?;
    let name = validate_name("folder name", &input.name)?;
    let parent_directory = existing_directory(&root, &parent)?;
    ensure_not_reserved(&parent, &name)?;
    ensure_name_is_free(&parent_directory, &name, None)?;

    let path = join(&parent, &name);
    fs::create_dir(absolute(&root, &path))?;

    let connection = state.database();
    let mut changes = ChangeSet::new();
    changes.track("path", None, Some(path.as_str()));
    record(&connection, &path, ActivityAction::Created, changes)?;
    refresh_search(&connection, &root)?;
    entry_of(&connection, path)
}

pub fn rename(state: &AppState, path: &str, new_name: &str) -> AppResult<FolderEntry> {
    let root = vault_root(state)?;
    let path = folder_path(path)?;
    let name = validate_name("folder name", new_name)?;
    let directory = existing_directory(&root, &path)?;
    let parent = parent_of(&path).to_string();
    ensure_not_reserved(&parent, &name)?;

    let is_unchanged = name_of(&path) == name;
    if is_unchanged {
        return entry_of(&state.database(), path);
    }
    let parent_directory = absolute(&root, &parent);
    ensure_name_is_free(&parent_directory, &name, Some(&directory))?;

    let new_path = join(&parent, &name);
    relocate(state, &root, &path, &new_path, ActivityAction::Updated)
}

pub fn move_folder(
    state: &AppState,
    path: &str,
    new_parent_path: Option<&str>,
) -> AppResult<FolderEntry> {
    let root = vault_root(state)?;
    let path = folder_path(path)?;
    let new_parent = normalize_relative(new_parent_path.unwrap_or(""))?;
    let directory = existing_directory(&root, &path)?;
    let destination = existing_directory(&root, &new_parent)?;

    let would_end_up_inside_itself = is_same_or_inside(&new_parent, &path);
    if would_end_up_inside_itself {
        return Err(AppError::InvalidMove);
    }
    let name = name_of(&path).to_string();
    ensure_not_reserved(&new_parent, &name)?;
    let is_already_there = parent_of(&path) == new_parent;
    if is_already_there {
        return entry_of(&state.database(), path);
    }
    ensure_name_is_free(&destination, &name, Some(&directory))?;

    let new_path = join(&new_parent, &name);
    relocate(state, &root, &path, &new_path, ActivityAction::Moved)
}

/// Deletes a folder. A non-empty folder is only deleted with `recursive`, which removes
/// everything inside it (notes and any other file) from the disk.
pub fn delete(state: &AppState, path: &str, recursive: bool) -> AppResult<()> {
    let root = vault_root(state)?;
    let path = folder_path(path)?;
    let directory = existing_directory(&root, &path)?;

    let is_empty = fs::read_dir(&directory)?.next().is_none();
    if !is_empty && !recursive {
        return Err(AppError::Conflict(
            "the folder is not empty; delete it recursively to remove its contents".into(),
        ));
    }

    let mut connection = state.database();
    let transaction = connection.transaction()?;
    repository::delete_directory(&transaction, &path)?;
    favorites_repository::delete_folder_tree(&transaction, &path)?;
    let mut changes = ChangeSet::new();
    changes.track("path", Some(path.as_str()), None);
    record(&transaction, &path, ActivityAction::Deleted, changes)?;
    if recursive {
        fs::remove_dir_all(&directory)?;
    } else {
        fs::remove_dir(&directory)?;
    }
    refresh_search(&transaction, &root)?;
    transaction.commit()?;
    Ok(())
}

/// Renames or moves a directory on disk and re-points the indexed notes below it. If the index
/// update fails the directory is put back, so disk and index never disagree.
fn relocate(
    state: &AppState,
    root: &Path,
    path: &str,
    new_path: &str,
    action: ActivityAction,
) -> AppResult<FolderEntry> {
    let from = absolute(root, path);
    let to = absolute(root, new_path);
    fs::rename(&from, &to)?;

    let mut connection = state.database();
    let result = update_index(&mut connection, root, path, new_path, action);
    if let Err(error) = result {
        if let Err(restore_error) = fs::rename(&to, &from) {
            log::error!("could not undo the move of '{path}': {restore_error}");
        }
        return Err(error);
    }
    entry_of(&connection, new_path.to_string())
}

fn update_index(
    connection: &mut Connection,
    root: &Path,
    path: &str,
    new_path: &str,
    action: ActivityAction,
) -> AppResult<()> {
    let transaction = connection.transaction()?;
    repository::rename_directory(&transaction, path, new_path)?;
    favorites_repository::rename_folder(&transaction, path, new_path)?;
    let mut changes = ChangeSet::new();
    changes.track("path", Some(path), Some(new_path));
    record(&transaction, new_path, action, changes)?;
    refresh_search(&transaction, root)?;
    transaction.commit()?;
    Ok(())
}

/// A folder path that names a folder inside the vault. The vault root itself is never a valid
/// target for rename, move or delete.
fn folder_path(input: &str) -> AppResult<String> {
    let path = normalize_relative(input)?;
    let is_vault_root = path.is_empty();
    if is_vault_root {
        return Err(AppError::Validation(
            "choose a folder inside the vault, not the vault itself".into(),
        ));
    }
    Ok(path)
}

/// Keeps the search index of folders in step with the directories on disk.
fn refresh_search(connection: &Connection, root: &Path) -> AppResult<()> {
    search_repository::replace_folders(connection, &list_directories(root))
}

fn entry_of(connection: &Connection, path: String) -> AppResult<FolderEntry> {
    let direct_notes = repository::list_under(connection, &path)?
        .iter()
        .filter(|note| parent_of(&note.path) == path)
        .count();
    Ok(FolderEntry {
        name: name_of(&path).to_string(),
        note_count: u32::try_from(direct_notes).unwrap_or(u32::MAX),
        path,
    })
}

fn ensure_not_reserved(parent: &str, name: &str) -> AppResult<()> {
    let is_root = parent.is_empty();
    let is_reserved = name.eq_ignore_ascii_case(ATTACHMENTS_DIRECTORY);
    if is_root && is_reserved {
        return Err(AppError::Validation(format!(
            "'{ATTACHMENTS_DIRECTORY}' is reserved for pasted images"
        )));
    }
    Ok(())
}

fn ensure_name_is_free(directory: &Path, name: &str, except: Option<&Path>) -> AppResult<()> {
    if name_is_taken(directory, name, except) {
        return Err(AppError::Conflict(format!(
            "'{name}' already exists in that folder"
        )));
    }
    Ok(())
}

fn record(
    connection: &Connection,
    path: &str,
    action: ActivityAction,
    changes: ChangeSet,
) -> AppResult<()> {
    activity::record(connection, EntityType::Folder, path, action, changes)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{connection::open_in_memory, migrations};
    use crate::modules::activity::models::ActivityEntry;
    use crate::modules::notes::vault_service::{SetupVaultInput, setup};

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

    fn write(fixture: &Fixture, relative: &str, content: &str) {
        let path = fixture.vault.path().join(relative);
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).expect("creates dirs");
        }
        fs::write(path, content).expect("writes");
    }

    fn reindex(fixture: &Fixture) {
        crate::modules::notes::vault_service::reindex(&fixture.state).expect("reindexes");
    }

    fn folder(fixture: &Fixture, parent: Option<&str>, name: &str) -> AppResult<FolderEntry> {
        create(
            &fixture.state,
            CreateFolderInput {
                parent_path: parent.map(str::to_string),
                name: name.into(),
            },
        )
    }

    fn folder_paths(fixture: &Fixture) -> Vec<String> {
        list(&fixture.state)
            .expect("lists")
            .into_iter()
            .map(|entry| entry.path)
            .collect()
    }

    fn note_paths(fixture: &Fixture) -> Vec<String> {
        repository::list_all(&fixture.state.database())
            .expect("lists")
            .into_iter()
            .map(|note| note.path)
            .collect()
    }

    fn entries(fixture: &Fixture) -> Vec<ActivityEntry> {
        let mut all = activity::recent(&fixture.state, Some(100)).expect("reads activity");
        all.reverse();
        all.into_iter()
            .filter(|entry| entry.entity_type == EntityType::Folder)
            .collect()
    }

    #[test]
    fn create_makes_a_real_directory_at_the_root_or_nested() {
        let fixture = fixture();

        let top = folder(&fixture, None, "  Projects  ").expect("creates");
        let nested = folder(&fixture, Some("Projects"), "Web").expect("creates");

        assert_eq!(
            (top.path.as_str(), top.name.as_str()),
            ("Projects", "Projects")
        );
        assert_eq!(nested.path, "Projects/Web");
        assert!(fixture.vault.path().join("Projects").join("Web").is_dir());
        assert_eq!(nested.note_count, 0);
    }

    #[test]
    fn create_rejects_bad_names_duplicates_missing_parents_and_the_reserved_name() {
        let fixture = fixture();
        folder(&fixture, None, "Docs").expect("creates");

        assert!(matches!(
            folder(&fixture, None, "  "),
            Err(AppError::Validation(_))
        ));
        assert!(matches!(
            folder(&fixture, None, "a/b"),
            Err(AppError::Validation(_))
        ));
        assert!(matches!(
            folder(&fixture, None, ".hidden"),
            Err(AppError::Validation(_))
        ));
        assert!(matches!(
            folder(&fixture, None, "docs"),
            Err(AppError::Conflict(_))
        ));
        assert!(matches!(
            folder(&fixture, Some("Ghost"), "x"),
            Err(AppError::NotFound(_))
        ));
        assert!(matches!(
            folder(&fixture, Some("../x"), "y"),
            Err(AppError::Validation(_))
        ));
        assert!(matches!(
            folder(&fixture, None, "Attachments"),
            Err(AppError::Validation(_))
        ));
        assert!(folder(&fixture, Some("Docs"), "attachments").is_ok());
    }

    #[test]
    fn folders_need_a_configured_vault() {
        let mut connection = open_in_memory().expect("opens");
        migrations::run(&mut connection).expect("migrates");
        let state = AppState::new(connection, None);

        let result = create(
            &state,
            CreateFolderInput {
                parent_path: None,
                name: "x".into(),
            },
        );

        assert!(matches!(result, Err(AppError::NotFound(_))));
        assert!(matches!(list(&state), Err(AppError::NotFound(_))));
    }

    #[test]
    fn list_shows_every_visible_directory_with_its_direct_note_count() {
        let fixture = fixture();
        write(&fixture, "root.md", "# Root\n");
        write(&fixture, "Docs/a.md", "# A\n");
        write(&fixture, "Docs/b.md", "# B\n");
        write(&fixture, "Docs/Deep/c.md", "# C\n");
        fs::create_dir_all(fixture.vault.path().join("Empty")).expect("creates dir");
        fs::create_dir_all(fixture.vault.path().join(".hidden/x")).expect("creates dir");
        fs::create_dir_all(fixture.vault.path().join("attachments")).expect("creates dir");
        write(&fixture, "plain.txt", "not a folder");
        reindex(&fixture);

        let listed = list(&fixture.state).expect("lists");

        let summary: Vec<(&str, u32)> = listed
            .iter()
            .map(|entry| (entry.path.as_str(), entry.note_count))
            .collect();
        assert_eq!(summary, [("Docs", 2), ("Docs/Deep", 1), ("Empty", 0)]);
    }

    #[test]
    fn renaming_moves_the_directory_and_re_points_the_notes_keeping_their_ids_and_content() {
        let fixture = fixture();
        write(&fixture, "docs/a.md", "---\nid: a-id\n---\n# A\n[[B]]\n");
        write(&fixture, "docs/deep/b.md", "---\nid: b-id\n---\n# B\n");
        write(&fixture, "docs2/c.md", "---\nid: c-id\n---\n# C\n");
        reindex(&fixture);
        let before = fs::read_to_string(fixture.vault.path().join("docs/a.md")).expect("reads");

        let renamed = rename(&fixture.state, "docs", "Archive").expect("renames");

        assert_eq!(renamed.path, "Archive");
        assert_eq!(renamed.note_count, 1);
        assert_eq!(
            note_paths(&fixture),
            ["Archive/a.md", "Archive/deep/b.md", "docs2/c.md"]
        );
        let notes = repository::list_all(&fixture.state.database()).expect("lists");
        let ids: Vec<&str> = notes.iter().map(|note| note.id.as_str()).collect();
        assert_eq!(ids, ["a-id", "b-id", "c-id"]);
        assert!(!fixture.vault.path().join("docs").exists());
        let after = fs::read_to_string(fixture.vault.path().join("Archive/a.md")).expect("reads");
        assert_eq!(after, before);
        assert_eq!(
            repository::list_links(&fixture.state.database(), "a-id")
                .expect("lists")
                .len(),
            1
        );
    }

    #[test]
    fn a_rename_that_only_changes_the_case_works() {
        let fixture = fixture();
        write(&fixture, "docs/a.md", "# A\n");
        reindex(&fixture);

        let renamed = rename(&fixture.state, "docs", "Docs").expect("renames");

        assert_eq!(renamed.path, "Docs");
        assert_eq!(note_paths(&fixture), ["Docs/a.md"]);
        assert_eq!(folder_paths(&fixture), ["Docs"]);
    }

    #[test]
    fn renaming_to_the_same_name_is_a_no_op_and_to_an_existing_one_a_conflict() {
        let fixture = fixture();
        folder(&fixture, None, "One").expect("creates");
        folder(&fixture, None, "Two").expect("creates");
        let before = entries(&fixture).len();

        let same = rename(&fixture.state, "One", "One").expect("no-op");
        let clash = rename(&fixture.state, "One", "two");

        assert_eq!(same.path, "One");
        assert!(matches!(clash, Err(AppError::Conflict(_))));
        assert_eq!(entries(&fixture).len(), before);
        assert_eq!(folder_paths(&fixture), ["One", "Two"]);
    }

    #[test]
    fn rename_validates_the_name_the_folder_and_the_reserved_name() {
        let fixture = fixture();
        folder(&fixture, None, "One").expect("creates");

        assert!(matches!(
            rename(&fixture.state, "One", "a/b"),
            Err(AppError::Validation(_))
        ));
        assert!(matches!(
            rename(&fixture.state, "One", "attachments"),
            Err(AppError::Validation(_))
        ));
        assert!(matches!(
            rename(&fixture.state, "Ghost", "x"),
            Err(AppError::NotFound(_))
        ));
        assert!(matches!(
            rename(&fixture.state, "../One", "x"),
            Err(AppError::Validation(_))
        ));
        assert!(matches!(
            rename(&fixture.state, "attachments", "x"),
            Err(AppError::Validation(_))
        ));
    }

    #[test]
    fn moving_re_points_the_notes_and_can_target_the_root() {
        let fixture = fixture();
        write(&fixture, "a/inner/n.md", "# N\n");
        folder(&fixture, None, "b").expect("creates");
        reindex(&fixture);

        let into_b = move_folder(&fixture.state, "a/inner", Some("b")).expect("moves");
        let back_to_root = move_folder(&fixture.state, "b/inner", None).expect("moves");

        assert_eq!(into_b.path, "b/inner");
        assert_eq!(back_to_root.path, "inner");
        assert_eq!(note_paths(&fixture), ["inner/n.md"]);
        assert_eq!(folder_paths(&fixture), ["a", "b", "inner"]);
    }

    #[test]
    fn a_folder_cannot_be_moved_into_itself_or_a_descendant() {
        let fixture = fixture();
        folder(&fixture, None, "a").expect("creates");
        folder(&fixture, Some("a"), "b").expect("creates");
        folder(&fixture, Some("a/b"), "c").expect("creates");

        let into_itself = move_folder(&fixture.state, "a", Some("a"));
        let into_child = move_folder(&fixture.state, "a", Some("a/b"));
        let into_grandchild = move_folder(&fixture.state, "a", Some("a/b/c"));

        assert!(matches!(into_itself, Err(AppError::InvalidMove)));
        assert!(matches!(into_child, Err(AppError::InvalidMove)));
        assert!(matches!(into_grandchild, Err(AppError::InvalidMove)));
        assert_eq!(folder_paths(&fixture), ["a", "a/b", "a/b/c"]);
    }

    #[test]
    fn a_folder_whose_name_merely_starts_like_the_target_can_still_be_moved_there() {
        let fixture = fixture();
        folder(&fixture, None, "ab").expect("creates");
        folder(&fixture, None, "a").expect("creates");

        let moved = move_folder(&fixture.state, "a", Some("ab")).expect("moves");

        assert_eq!(moved.path, "ab/a");
    }

    #[test]
    fn move_rejects_name_clashes_missing_folders_and_does_nothing_for_the_same_parent() {
        let fixture = fixture();
        folder(&fixture, None, "a").expect("creates");
        folder(&fixture, None, "b").expect("creates");
        folder(&fixture, Some("b"), "a").expect("creates");
        let before = entries(&fixture).len();

        let clash = move_folder(&fixture.state, "a", Some("b"));
        let missing_folder = move_folder(&fixture.state, "ghost", None);
        let missing_target = move_folder(&fixture.state, "a", Some("ghost"));
        let same_parent = move_folder(&fixture.state, "b/a", Some("b")).expect("no-op");

        assert!(matches!(clash, Err(AppError::Conflict(_))));
        assert!(matches!(missing_folder, Err(AppError::NotFound(_))));
        assert!(matches!(missing_target, Err(AppError::NotFound(_))));
        assert_eq!(same_parent.path, "b/a");
        assert_eq!(entries(&fixture).len(), before);
    }

    #[test]
    fn an_empty_folder_is_deleted_and_a_non_empty_one_needs_the_recursive_flag() {
        let fixture = fixture();
        folder(&fixture, None, "empty").expect("creates");
        write(&fixture, "full/a.md", "# A\n");
        write(&fixture, "full/readme.txt", "not a note");
        reindex(&fixture);

        delete(&fixture.state, "empty", false).expect("deletes");
        let refused = delete(&fixture.state, "full", false);

        assert!(matches!(refused, Err(AppError::Conflict(_))));
        assert!(!fixture.vault.path().join("empty").exists());
        assert!(fixture.vault.path().join("full/a.md").exists());
        assert_eq!(note_paths(&fixture), ["full/a.md"]);
    }

    #[test]
    fn a_recursive_delete_removes_the_subtree_from_disk_and_from_the_index_only() {
        let fixture = fixture();
        write(&fixture, "full/a.md", "---\nid: a-id\n---\n# A\n[[X]]\n");
        write(&fixture, "full/deep/b.md", "# B\n");
        write(&fixture, "full/readme.txt", "other file");
        write(&fixture, "full2/keep.md", "# Keep\n");
        reindex(&fixture);

        delete(&fixture.state, "full", true).expect("deletes");

        assert!(!fixture.vault.path().join("full").exists());
        assert_eq!(note_paths(&fixture), ["full2/keep.md"]);
        assert!(
            repository::list_links(&fixture.state.database(), "a-id")
                .expect("lists")
                .is_empty()
        );
    }

    #[test]
    fn delete_rejects_missing_and_reserved_paths() {
        let fixture = fixture();
        fs::create_dir_all(fixture.vault.path().join("attachments")).expect("creates dir");

        assert!(matches!(
            delete(&fixture.state, "ghost", true),
            Err(AppError::NotFound(_))
        ));
        assert!(matches!(
            delete(&fixture.state, "attachments", true),
            Err(AppError::Validation(_))
        ));
        assert!(matches!(
            delete(&fixture.state, "../x", true),
            Err(AppError::Validation(_))
        ));
        assert!(fixture.vault.path().join("attachments").exists());
    }

    #[test]
    fn the_vault_root_itself_cannot_be_deleted_renamed_or_moved() {
        let fixture = fixture();
        folder(&fixture, None, "child").expect("creates");

        assert!(matches!(
            delete(&fixture.state, "", true),
            Err(AppError::Validation(_))
        ));
        assert!(matches!(
            delete(&fixture.state, " / ", false),
            Err(AppError::Validation(_))
        ));
        assert!(matches!(
            rename(&fixture.state, "", "x"),
            Err(AppError::Validation(_))
        ));
        assert!(matches!(
            move_folder(&fixture.state, "", Some("child")),
            Err(AppError::Validation(_))
        ));
        assert!(fixture.vault.path().join("child").is_dir());
    }

    #[test]
    fn deleting_a_folder_in_an_otherwise_empty_vault_never_touches_the_vault_itself() {
        let fixture = fixture();
        folder(&fixture, None, "only").expect("creates");

        delete(&fixture.state, "only", false).expect("deletes");

        assert!(fixture.vault.path().is_dir());
        assert!(folder_paths(&fixture).is_empty());
    }

    #[test]
    fn a_failing_index_update_puts_the_directory_back() {
        let fixture = fixture();
        write(&fixture, "docs/a.md", "# A\n");
        reindex(&fixture);
        fixture
            .state
            .database()
            .execute_batch("DROP TABLE note_links; DROP TABLE notes;")
            .expect("drops tables");

        let result = rename(&fixture.state, "docs", "Archive");

        assert!(result.is_err());
        assert!(fixture.vault.path().join("docs/a.md").exists());
        assert!(!fixture.vault.path().join("Archive").exists());
    }

    #[test]
    fn every_change_is_logged_with_the_path() {
        let fixture = fixture();
        folder(&fixture, None, "a").expect("creates");
        folder(&fixture, None, "b").expect("creates");
        rename(&fixture.state, "a", "a2").expect("renames");
        move_folder(&fixture.state, "a2", Some("b")).expect("moves");
        delete(&fixture.state, "b/a2", false).expect("deletes");

        let logged = entries(&fixture);

        let actions: Vec<ActivityAction> = logged.iter().map(|entry| entry.action).collect();
        assert_eq!(
            actions,
            [
                ActivityAction::Created,
                ActivityAction::Created,
                ActivityAction::Updated,
                ActivityAction::Moved,
                ActivityAction::Deleted
            ]
        );
        let renamed = logged[2].changes.as_ref().expect("has changes");
        assert_eq!(renamed["path"].from.as_deref(), Some("a"));
        assert_eq!(renamed["path"].to.as_deref(), Some("a2"));
        assert_eq!(logged[4].entity_id, "b/a2");
    }

    #[test]
    fn unicode_folder_names_work_end_to_end() {
        let fixture = fixture();
        write(&fixture, "Anotações/nota.md", "# Nota\n");
        reindex(&fixture);

        let renamed = rename(&fixture.state, "Anotações", "日本語のメモ").expect("renames");

        assert_eq!(renamed.path, "日本語のメモ");
        assert_eq!(note_paths(&fixture), ["日本語のメモ/nota.md"]);
    }
}
