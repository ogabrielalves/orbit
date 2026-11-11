use std::fs;
use std::path::{Path, PathBuf};

use rusqlite::Connection;

use super::index_service::{self, FileOutcome};
use super::models::{
    CreateNoteInput, ListNotesInput, NoteDetails, NoteRecord, NoteSummary, RenameNoteResult,
    SaveNoteInput,
};
use super::repository;
use super::vault_service::vault_root;
use crate::error::{AppError, AppResult};
use crate::modules::activity::models::{ActivityAction, ChangeSet, EntityType};
use crate::modules::activity::service as activity;
use crate::shared::time;
use crate::state::AppState;
use crate::vault::frontmatter::{self, Frontmatter};
use crate::vault::hash::content_hash;
use crate::vault::indexer::MAX_NOTE_BYTES;
use crate::vault::links::{retarget, title_key};
use crate::vault::names::validate_name;
use crate::vault::paths::{
    absolute, existing_directory, is_same_or_inside, join, name_is_taken, normalize_relative,
    parent_of,
};
use crate::vault::title::replace_title;
use crate::vault::writer::write_atomic;

pub const MAX_TAGS_PER_NOTE: usize = 30;
pub const TAG_MAX_LENGTH: usize = 40;
const NOTE_EXTENSION: &str = ".md";

pub fn list(state: &AppState, input: ListNotesInput) -> AppResult<Vec<NoteSummary>> {
    let root = vault_root(state)?;
    let connection = state.database();
    let all = repository::list_all(&connection)?;
    let Some(folder) = input.folder_path else {
        return Ok(all.into_iter().map(NoteSummary::from).collect());
    };

    let folder = normalize_relative(&folder)?;
    existing_directory(&root, &folder)?;
    let is_wanted = |note: &NoteRecord| {
        let is_direct_child = parent_of(&note.path) == folder;
        let is_below = folder.is_empty() || is_same_or_inside(&note.path, &folder);
        is_direct_child || (input.include_subfolders && is_below)
    };
    Ok(all
        .into_iter()
        .filter(is_wanted)
        .map(NoteSummary::from)
        .collect())
}

pub fn get(state: &AppState, id: &str) -> AppResult<NoteDetails> {
    let root = vault_root(state)?;
    let connection = state.database();
    let record = fresh_record(&connection, &root, id)?;
    details_of(&root, &record)
}

pub fn create(state: &AppState, input: CreateNoteInput) -> AppResult<NoteDetails> {
    let root = vault_root(state)?;
    let folder = normalize_relative(input.folder_path.as_deref().unwrap_or(""))?;
    let title = validate_name("note title", &input.title)?;
    let tags = normalize_tags(input.tags.unwrap_or_default())?;
    let body = input.content.unwrap_or_else(|| format!("\n# {title}\n"));
    ensure_size(&body)?;
    let folder_directory = existing_directory(&root, &folder)?;
    let file_name = format!("{title}{NOTE_EXTENSION}");
    ensure_name_is_free(&folder_directory, &file_name, None)?;

    let mut note_frontmatter = Frontmatter::new(&crate::shared::id::new_id(), &time::now());
    note_frontmatter.tags = tags;
    let text = frontmatter::render(&note_frontmatter, &body);
    let relative = join(&folder, &file_name);
    write_atomic(&absolute(&root, &relative), text.as_bytes())?;

    let connection = state.database();
    index_service::index_file(&connection, &root, &relative)?;
    let record = repository::find_by_path(&connection, &relative)?.ok_or(AppError::Internal)?;
    let mut changes = ChangeSet::new();
    changes.track("title", None, Some(record.title.as_str()));
    changes.track("path", None, Some(record.path.as_str()));
    record_activity(&connection, &record.id, ActivityAction::Created, changes)?;
    details_of(&root, &record)
}

pub fn save(state: &AppState, id: &str, input: SaveNoteInput) -> AppResult<NoteDetails> {
    let root = vault_root(state)?;
    ensure_size(&input.content)?;
    let tags = input.tags.map(normalize_tags).transpose()?;
    let connection = state.database();
    let record = find_existing(&connection, id)?;
    let path = absolute(&root, &record.path);

    let current = read_text(&path)?;
    let has_changed_outside = content_hash(current.as_bytes()) != input.base_hash;
    if has_changed_outside && !input.force {
        return Err(AppError::Conflict(
            "the note changed outside ORBIT since it was opened".into(),
        ));
    }

    let mut note_frontmatter = frontmatter::parse(&current).frontmatter;
    note_frontmatter.id = Some(record.id.clone());
    if note_frontmatter.created.is_none() {
        note_frontmatter.created = Some(record.created_at.clone());
    }
    if let Some(tags) = tags {
        note_frontmatter.tags = tags;
    }
    let text = frontmatter::render(&note_frontmatter, &input.content);
    write_atomic(&path, text.as_bytes())?;

    index_service::index_file(&connection, &root, &record.path)?;
    let saved = find_existing(&connection, id)?;
    details_of(&root, &saved)
}

pub fn rename(state: &AppState, id: &str, new_title: &str) -> AppResult<RenameNoteResult> {
    let root = vault_root(state)?;
    let new_title = validate_name("note title", new_title)?;
    let connection = state.database();
    let record = fresh_record(&connection, &root, id)?;
    let old_title = record.title.clone();

    let folder = parent_of(&record.path).to_string();
    let new_file_name = format!("{new_title}{NOTE_EXTENSION}");
    let new_path = join(&folder, &new_file_name);
    let is_unchanged = new_path == record.path && new_title == old_title;
    if is_unchanged {
        return Ok(RenameNoteResult {
            note: record.into(),
            rewritten_notes: 0,
        });
    }

    let old_absolute = absolute(&root, &record.path);
    let new_absolute = absolute(&root, &new_path);
    ensure_name_is_free(
        &absolute(&root, &folder),
        &new_file_name,
        Some(&old_absolute),
    )?;
    rename_file_and_heading(&old_absolute, &new_absolute, &old_title, &new_title)?;

    repoint(&connection, &record, &new_path)?;
    index_service::index_file(&connection, &root, &new_path)?;
    let renamed = find_existing(&connection, id)?;
    let rewritten_notes = rewrite_incoming_links(&connection, &root, &renamed, &old_title)?;

    let mut changes = ChangeSet::new();
    changes.track(
        "title",
        Some(old_title.as_str()),
        Some(renamed.title.as_str()),
    );
    changes.track(
        "path",
        Some(record.path.as_str()),
        Some(renamed.path.as_str()),
    );
    record_activity(&connection, id, ActivityAction::Updated, changes)?;
    Ok(RenameNoteResult {
        note: renamed.into(),
        rewritten_notes,
    })
}

pub fn move_note(
    state: &AppState,
    id: &str,
    new_folder_path: Option<&str>,
) -> AppResult<NoteSummary> {
    let root = vault_root(state)?;
    let folder = normalize_relative(new_folder_path.unwrap_or(""))?;
    let connection = state.database();
    let record = fresh_record(&connection, &root, id)?;
    let destination = existing_directory(&root, &folder)?;

    let is_already_there = parent_of(&record.path) == folder;
    if is_already_there {
        return Ok(record.into());
    }
    let file_name = file_name_of(&record.path);
    let old_absolute = absolute(&root, &record.path);
    ensure_name_is_free(&destination, file_name, Some(&old_absolute))?;

    let new_path = join(&folder, file_name);
    fs::rename(&old_absolute, absolute(&root, &new_path))?;
    repoint(&connection, &record, &new_path)?;
    index_service::index_file(&connection, &root, &new_path)?;
    let moved = find_existing(&connection, id)?;

    let mut changes = ChangeSet::new();
    changes.track(
        "path",
        Some(record.path.as_str()),
        Some(moved.path.as_str()),
    );
    record_activity(&connection, id, ActivityAction::Moved, changes)?;
    Ok(moved.into())
}

pub fn delete(state: &AppState, id: &str) -> AppResult<()> {
    let root = vault_root(state)?;
    let connection = state.database();
    let record = find_existing(&connection, id)?;

    let mut changes = ChangeSet::new();
    changes.track("title", Some(record.title.as_str()), None);
    changes.track("path", Some(record.path.as_str()), None);
    record_activity(&connection, id, ActivityAction::Deleted, changes)?;
    match fs::remove_file(absolute(&root, &record.path)) {
        Ok(()) => {}
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(error) => return Err(error.into()),
    }
    repository::delete(&connection, id)?;
    Ok(())
}

fn repoint(connection: &Connection, record: &NoteRecord, new_path: &str) -> AppResult<()> {
    let moved = NoteRecord {
        path: new_path.to_string(),
        hash: "0".repeat(64),
        ..record.clone()
    };
    repository::update(connection, &moved)?;
    Ok(())
}

fn rename_file_and_heading(
    old_absolute: &Path,
    new_absolute: &Path,
    old_title: &str,
    new_title: &str,
) -> AppResult<()> {
    let text = read_text(old_absolute)?;
    let parsed = frontmatter::parse(&text);
    let new_body = replace_title(&parsed.body, old_title, new_title);

    let moves_the_file = old_absolute != new_absolute;
    if moves_the_file {
        fs::rename(old_absolute, new_absolute)?;
    }
    let Some(new_body) = new_body else {
        return Ok(());
    };
    let prefix_length = text.len() - parsed.body.len();
    let new_text = format!("{}{new_body}", &text[..prefix_length]);
    let written = write_atomic(new_absolute, new_text.as_bytes());
    if let Err(error) = written {
        if moves_the_file && let Err(restore_error) = fs::rename(new_absolute, old_absolute) {
            log::error!("could not undo the rename of a note: {restore_error}");
        }
        return Err(error);
    }
    Ok(())
}

fn rewrite_incoming_links(
    connection: &Connection,
    root: &Path,
    renamed: &NoteRecord,
    old_title: &str,
) -> AppResult<u32> {
    let old_key = title_key(old_title);
    let still_resolves = old_key == renamed.title_key
        || repository::count_with_title_key(connection, &old_key, &renamed.id)? > 0;
    if still_resolves {
        return Ok(0);
    }

    let mut rewritten = 0;
    for source in repository::list_linking_to(connection, &old_key)? {
        let path = absolute(root, &source.path);
        let outcome = rewrite_file_links(&path, old_title, &renamed.title);
        match outcome {
            Ok(true) => {
                index_service::index_file(connection, root, &source.path)?;
                rewritten += 1;
            }
            Ok(false) => {}
            Err(error) => log::warn!("could not update links in '{}': {error}", source.path),
        }
    }
    Ok(rewritten)
}

fn rewrite_file_links(path: &Path, old_title: &str, new_title: &str) -> AppResult<bool> {
    let text = read_text(path)?;
    let (rewritten, changed) = retarget(&text, old_title, new_title);
    if changed == 0 {
        return Ok(false);
    }
    write_atomic(path, rewritten.as_bytes())?;
    Ok(true)
}

fn find_existing(connection: &Connection, id: &str) -> AppResult<NoteRecord> {
    repository::find_by_id(connection, id)?.ok_or_else(|| AppError::NotFound("note".into()))
}

fn fresh_record(connection: &Connection, root: &Path, id: &str) -> AppResult<NoteRecord> {
    let record = find_existing(connection, id)?;
    let indexed = index_service::index_file(connection, root, &record.path)?;
    if indexed.outcome == FileOutcome::Skipped {
        return Err(AppError::NotFound("note".into()));
    }
    find_existing(connection, id)
}

fn details_of(root: &Path, record: &NoteRecord) -> AppResult<NoteDetails> {
    let path: PathBuf = absolute(root, &record.path);
    let text = read_text(&path)?;
    let parsed = frontmatter::parse(&text);
    Ok(NoteDetails {
        id: record.id.clone(),
        path: record.path.clone(),
        title: record.title.clone(),
        tags: parsed.frontmatter.tags,
        created_at: record.created_at.clone(),
        modified_at: record.modified_at.clone(),
        content: parsed.body,
        hash: content_hash(text.as_bytes()),
    })
}

fn read_text(path: &Path) -> AppResult<String> {
    let bytes = fs::read(path).map_err(|error| match error.kind() {
        std::io::ErrorKind::NotFound => AppError::NotFound("note".into()),
        _ => AppError::from(error),
    })?;
    String::from_utf8(bytes)
        .map_err(|_| AppError::Validation("the note is not valid UTF-8 text".into()))
}

fn ensure_size(content: &str) -> AppResult<()> {
    let is_too_large = content.len() as u64 > MAX_NOTE_BYTES;
    if is_too_large {
        return Err(AppError::Validation(
            "the note is too large (10 MB limit)".into(),
        ));
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

fn file_name_of(relative: &str) -> &str {
    relative.rsplit_once('/').map_or(relative, |(_, name)| name)
}

fn normalize_tags(raw: Vec<String>) -> AppResult<Vec<String>> {
    let mut tags: Vec<String> = Vec::new();
    for item in raw {
        let tag = item.trim().trim_start_matches('#').trim().to_string();
        if tag.is_empty() {
            continue;
        }
        let is_too_long = tag.chars().count() > TAG_MAX_LENGTH;
        if is_too_long {
            return Err(AppError::Validation(format!(
                "a tag cannot exceed {TAG_MAX_LENGTH} characters"
            )));
        }
        let is_new = !tags.iter().any(|known| known.eq_ignore_ascii_case(&tag));
        if is_new {
            tags.push(tag);
        }
    }
    if tags.len() > MAX_TAGS_PER_NOTE {
        return Err(AppError::Validation(format!(
            "a note cannot have more than {MAX_TAGS_PER_NOTE} tags"
        )));
    }
    Ok(tags)
}

fn record_activity(
    connection: &Connection,
    note_id: &str,
    action: ActivityAction,
    changes: ChangeSet,
) -> AppResult<()> {
    activity::record(connection, EntityType::Note, note_id, action, changes)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{connection::open_in_memory, migrations};
    use crate::modules::activity::models::ActivityEntry;
    use crate::modules::notes::vault_service::{SetupVaultInput, reindex, setup};

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

    fn read(fixture: &Fixture, relative: &str) -> String {
        fs::read_to_string(fixture.vault.path().join(relative)).expect("reads")
    }

    fn new_note(fixture: &Fixture, folder: Option<&str>, title: &str) -> NoteDetails {
        create(
            &fixture.state,
            CreateNoteInput {
                folder_path: folder.map(str::to_string),
                title: title.into(),
                content: None,
                tags: None,
            },
        )
        .expect("creates note")
    }

    fn save_input(content: &str, base_hash: &str) -> SaveNoteInput {
        SaveNoteInput {
            content: content.into(),
            base_hash: base_hash.into(),
            tags: None,
            force: false,
        }
    }

    fn all_paths(fixture: &Fixture) -> Vec<String> {
        list(&fixture.state, ListNotesInput::default())
            .expect("lists")
            .into_iter()
            .map(|note| note.path)
            .collect()
    }

    fn entries(fixture: &Fixture) -> Vec<ActivityEntry> {
        let mut all = activity::recent(&fixture.state, Some(100)).expect("reads activity");
        all.reverse();
        all.into_iter()
            .filter(|entry| entry.entity_type == EntityType::Note)
            .collect()
    }

    fn link_keys(fixture: &Fixture, id: &str) -> Vec<String> {
        repository::list_links(&fixture.state.database(), id)
            .expect("lists")
            .into_iter()
            .map(|link| link.target_key)
            .collect()
    }

    #[test]
    fn create_writes_a_markdown_file_with_frontmatter_and_a_heading_and_indexes_it() {
        let fixture = fixture();

        let note = new_note(&fixture, None, "  Spring Boot  ");

        assert_eq!(note.path, "Spring Boot.md");
        assert_eq!(note.title, "Spring Boot");
        assert_eq!(note.content, "\n# Spring Boot\n");
        let text = read(&fixture, "Spring Boot.md");
        assert!(text.starts_with(&format!("---\nid: {}\ncreated: ", note.id)));
        assert!(text.ends_with("---\n\n# Spring Boot\n"));
        assert_eq!(note.hash, content_hash(text.as_bytes()));
        assert_eq!(all_paths(&fixture), ["Spring Boot.md"]);
    }

    #[test]
    fn create_accepts_a_folder_content_and_tags() {
        let fixture = fixture();
        fs::create_dir_all(fixture.vault.path().join("Projects")).expect("creates dir");

        let note = create(
            &fixture.state,
            CreateNoteInput {
                folder_path: Some("Projects".into()),
                title: "Plan".into(),
                content: Some("Just text, no heading.\n".into()),
                tags: Some(vec![
                    "#java".into(),
                    " backend ".into(),
                    "JAVA".into(),
                    "".into(),
                ]),
            },
        )
        .expect("creates");

        assert_eq!(note.path, "Projects/Plan.md");
        assert_eq!(note.title, "Plan");
        assert_eq!(note.tags, ["java", "backend"]);
        assert_eq!(note.content, "Just text, no heading.\n");
        assert!(read(&fixture, "Projects/Plan.md").contains("tags: [java, backend]"));
    }

    #[test]
    fn create_validates_the_title_folder_duplicates_tags_and_size() {
        let fixture = fixture();
        new_note(&fixture, None, "Taken");
        let attempt = |folder: Option<&str>,
                       title: &str,
                       tags: Option<Vec<String>>,
                       content: Option<String>| {
            create(
                &fixture.state,
                CreateNoteInput {
                    folder_path: folder.map(str::to_string),
                    title: title.into(),
                    content,
                    tags,
                },
            )
        };

        assert!(matches!(
            attempt(None, "  ", None, None),
            Err(AppError::Validation(_))
        ));
        assert!(matches!(
            attempt(None, "a/b", None, None),
            Err(AppError::Validation(_))
        ));
        assert!(matches!(
            attempt(None, "taken", None, None),
            Err(AppError::Conflict(_))
        ));
        assert!(matches!(
            attempt(Some("Ghost"), "x", None, None),
            Err(AppError::NotFound(_))
        ));
        assert!(matches!(
            attempt(Some("attachments"), "x", None, None),
            Err(AppError::Validation(_))
        ));
        assert!(matches!(
            attempt(None, "t", Some(vec!["x".repeat(TAG_MAX_LENGTH + 1)]), None),
            Err(AppError::Validation(_))
        ));
        let too_many: Vec<String> = (0..=MAX_TAGS_PER_NOTE).map(|i| format!("t{i}")).collect();
        assert!(matches!(
            attempt(None, "t", Some(too_many), None),
            Err(AppError::Validation(_))
        ));
        let huge = "a".repeat(MAX_NOTE_BYTES as usize + 1);
        assert!(matches!(
            attempt(None, "t", None, Some(huge)),
            Err(AppError::Validation(_))
        ));
        assert_eq!(all_paths(&fixture), ["Taken.md"]);
    }

    #[test]
    fn notes_need_a_configured_vault() {
        let mut connection = open_in_memory().expect("opens");
        migrations::run(&mut connection).expect("migrates");
        let state = AppState::new(connection, None);

        assert!(matches!(
            list(&state, ListNotesInput::default()),
            Err(AppError::NotFound(_))
        ));
        assert!(matches!(get(&state, "x"), Err(AppError::NotFound(_))));
    }

    #[test]
    fn get_returns_the_body_tags_and_hash_without_the_frontmatter() {
        let fixture = fixture();
        write(
            &fixture,
            "n.md",
            "---\nid: n1\ncreated: 2026-01-01T00:00:00Z\ntags: [a, b]\naliases: [x]\n---\n# Note\n\ntext\n",
        );
        reindex(&fixture.state).expect("indexes");

        let note = get(&fixture.state, "n1").expect("reads");

        assert_eq!(note.content, "# Note\n\ntext\n");
        assert_eq!(note.tags, ["a", "b"]);
        assert_eq!(note.created_at, "2026-01-01T00:00:00Z");
        assert_eq!(note.hash, content_hash(read(&fixture, "n.md").as_bytes()));
    }

    #[test]
    fn get_picks_up_edits_made_outside_the_app_and_updates_the_index() {
        let fixture = fixture();
        let note = new_note(&fixture, None, "Live");

        write(
            &fixture,
            "Live.md",
            &format!("---\nid: {}\n---\n# Live edited\n[[Other]]\n", note.id),
        );
        let reread = get(&fixture.state, &note.id).expect("reads");

        assert_eq!(reread.title, "Live edited");
        assert_ne!(reread.hash, note.hash);
        assert_eq!(link_keys(&fixture, &note.id), ["other"]);
    }

    #[test]
    fn get_of_an_unknown_or_deleted_note_is_not_found() {
        let fixture = fixture();
        let note = new_note(&fixture, None, "Gone");
        fs::remove_file(fixture.vault.path().join("Gone.md")).expect("removes file");

        assert!(matches!(
            get(&fixture.state, "ghost"),
            Err(AppError::NotFound(_))
        ));
        assert!(matches!(
            get(&fixture.state, &note.id),
            Err(AppError::NotFound(_))
        ));
    }

    #[test]
    fn list_filters_by_folder_and_optionally_includes_subfolders() {
        let fixture = fixture();
        new_note(&fixture, None, "Root");
        write(&fixture, "a/one.md", "# One\n");
        write(&fixture, "a/b/two.md", "# Two\n");
        write(&fixture, "ab/three.md", "# Three\n");
        reindex(&fixture.state).expect("indexes");
        let paths = |input: ListNotesInput| -> Vec<String> {
            list(&fixture.state, input)
                .expect("lists")
                .into_iter()
                .map(|note| note.path)
                .collect()
        };

        let all = paths(ListNotesInput::default());
        let root_only = paths(ListNotesInput {
            folder_path: Some(String::new()),
            include_subfolders: false,
        });
        let direct = paths(ListNotesInput {
            folder_path: Some("a".into()),
            include_subfolders: false,
        });
        let nested = paths(ListNotesInput {
            folder_path: Some("a".into()),
            include_subfolders: true,
        });
        let everything_from_root = paths(ListNotesInput {
            folder_path: Some(String::new()),
            include_subfolders: true,
        });

        assert_eq!(all, ["Root.md", "a/b/two.md", "a/one.md", "ab/three.md"]);
        assert_eq!(root_only, ["Root.md"]);
        assert_eq!(direct, ["a/one.md"]);
        assert_eq!(nested, ["a/b/two.md", "a/one.md"]);
        assert_eq!(everything_from_root, all);
        assert!(matches!(
            list(
                &fixture.state,
                ListNotesInput {
                    folder_path: Some("ghost".into()),
                    include_subfolders: false
                }
            ),
            Err(AppError::NotFound(_))
        ));
    }

    #[test]
    fn save_writes_the_content_keeps_the_frontmatter_and_refreshes_title_hash_and_links() {
        let fixture = fixture();
        write(
            &fixture,
            "n.md",
            "---\nid: n1\ncreated: 2026-01-01T00:00:00Z\naliases: [x]\n---\n# Old\n",
        );
        reindex(&fixture.state).expect("indexes");
        let opened = get(&fixture.state, "n1").expect("reads");

        let saved = save(
            &fixture.state,
            "n1",
            save_input("# New title\n\nSee [[Target]].\n", &opened.hash),
        )
        .expect("saves");

        assert_eq!(saved.title, "New title");
        assert_eq!(saved.content, "# New title\n\nSee [[Target]].\n");
        assert_ne!(saved.hash, opened.hash);
        let text = read(&fixture, "n.md");
        assert!(
            text.starts_with("---\nid: n1\ncreated: 2026-01-01T00:00:00Z\naliases: [x]\n---\n")
        );
        assert_eq!(saved.hash, content_hash(text.as_bytes()));
        assert_eq!(link_keys(&fixture, "n1"), ["target"]);
    }

    #[test]
    fn save_replaces_tags_only_when_given_and_keeps_them_otherwise() {
        let fixture = fixture();
        let note = create(
            &fixture.state,
            CreateNoteInput {
                folder_path: None,
                title: "Tagged".into(),
                content: None,
                tags: Some(vec!["one".into()]),
            },
        )
        .expect("creates");

        let kept = save(
            &fixture.state,
            &note.id,
            save_input("# Tagged\nbody\n", &note.hash),
        )
        .expect("saves");
        let replaced = save(
            &fixture.state,
            &note.id,
            SaveNoteInput {
                tags: Some(vec!["two".into(), "three".into()]),
                ..save_input("# Tagged\nbody\n", &kept.hash)
            },
        )
        .expect("saves");
        let cleared = save(
            &fixture.state,
            &note.id,
            SaveNoteInput {
                tags: Some(vec![]),
                ..save_input("# Tagged\nbody\n", &replaced.hash)
            },
        )
        .expect("saves");

        assert_eq!(kept.tags, ["one"]);
        assert_eq!(replaced.tags, ["two", "three"]);
        assert!(cleared.tags.is_empty());
        assert!(!read(&fixture, "Tagged.md").contains("tags:"));
    }

    #[test]
    fn save_detects_an_outside_edit_and_changes_nothing_unless_forced() {
        let fixture = fixture();
        let note = new_note(&fixture, None, "Shared");
        let outside = format!("---\nid: {}\n---\n# Shared\nedited elsewhere\n", note.id);
        write(&fixture, "Shared.md", &outside);

        let conflict = save(
            &fixture.state,
            &note.id,
            save_input("# Shared\nmy version\n", &note.hash),
        );
        let forced = save(
            &fixture.state,
            &note.id,
            SaveNoteInput {
                force: true,
                ..save_input("# Shared\nmy version\n", &note.hash)
            },
        );

        assert!(matches!(conflict, Err(AppError::Conflict(_))));
        assert_eq!(
            forced.expect("forced save").content,
            "# Shared\nmy version\n"
        );
        assert!(!read(&fixture, "Shared.md").contains("edited elsewhere"));
    }

    #[test]
    fn a_conflicting_save_leaves_the_file_exactly_as_it_was() {
        let fixture = fixture();
        let note = new_note(&fixture, None, "Safe");
        let outside = format!("---\nid: {}\n---\nexternal\n", note.id);
        write(&fixture, "Safe.md", &outside);

        let _ = save(&fixture.state, &note.id, save_input("mine", &note.hash));

        assert_eq!(read(&fixture, "Safe.md"), outside);
    }

    #[test]
    fn saving_a_deleted_or_unknown_note_is_not_found_and_oversized_content_is_rejected() {
        let fixture = fixture();
        let note = new_note(&fixture, None, "Temp");
        let huge = "a".repeat(MAX_NOTE_BYTES as usize + 1);
        fs::remove_file(fixture.vault.path().join("Temp.md")).expect("removes file");

        assert!(matches!(
            save(&fixture.state, &note.id, save_input("x", &note.hash)),
            Err(AppError::NotFound(_))
        ));
        assert!(matches!(
            save(&fixture.state, "ghost", save_input("x", "h")),
            Err(AppError::NotFound(_))
        ));
        assert!(matches!(
            save(&fixture.state, &note.id, save_input(&huge, &note.hash)),
            Err(AppError::Validation(_))
        ));
    }

    #[test]
    fn saving_twice_in_a_row_with_the_returned_hash_works() {
        let fixture = fixture();
        let note = new_note(&fixture, None, "Twice");

        let first = save(
            &fixture.state,
            &note.id,
            save_input("# Twice\none\n", &note.hash),
        )
        .expect("saves");
        let second = save(
            &fixture.state,
            &note.id,
            save_input("# Twice\ntwo\n", &first.hash),
        )
        .expect("saves");

        assert_eq!(second.content, "# Twice\ntwo\n");
    }

    #[test]
    fn save_restores_the_identity_when_the_file_lost_its_frontmatter_id_and_forced() {
        let fixture = fixture();
        let note = new_note(&fixture, None, "Id");
        write(&fixture, "Id.md", "no frontmatter at all\n");

        let saved = save(
            &fixture.state,
            &note.id,
            SaveNoteInput {
                force: true,
                ..save_input("# Id\nrestored\n", "stale")
            },
        )
        .expect("saves");

        assert_eq!(saved.id, note.id);
        assert!(read(&fixture, "Id.md").contains(&format!("id: {}", note.id)));
    }

    #[test]
    fn rename_changes_the_file_name_and_the_heading_but_not_the_id() {
        let fixture = fixture();
        let note = new_note(&fixture, with_folder(&fixture, "Docs"), "Old name");

        let result = rename(&fixture.state, &note.id, "New name").expect("renames");

        assert_eq!(result.note.id, note.id);
        assert_eq!(result.note.path, "Docs/New name.md");
        assert_eq!(result.note.title, "New name");
        assert!(!fixture.vault.path().join("Docs/Old name.md").exists());
        let text = read(&fixture, "Docs/New name.md");
        assert!(text.contains("# New name"));
        assert!(!text.contains("Old name"));
        assert!(text.contains(&format!("id: {}", note.id)));
    }

    fn with_folder<'a>(fixture: &Fixture, name: &'a str) -> Option<&'a str> {
        fs::create_dir_all(fixture.vault.path().join(name)).expect("creates dir");
        Some(name)
    }

    #[test]
    fn rename_rewrites_links_in_other_notes_keeping_aliases_and_headings() {
        let fixture = fixture();
        let target = new_note(&fixture, None, "Hibernate");
        write(
            &fixture,
            "a.md",
            "---\nid: a1\n---\n# A\nUses [[Hibernate]] and [[hibernate#Setup|the ORM]].\n```\n[[Hibernate]]\n```\n",
        );
        write(&fixture, "b.md", "---\nid: b1\n---\n# B\nNo link here.\n");
        write(&fixture, "c.md", "---\nid: c1\n---\n# C\n[[Hibernate]]\n");
        reindex(&fixture.state).expect("indexes");

        let result = rename(&fixture.state, &target.id, "JPA").expect("renames");

        assert_eq!(result.rewritten_notes, 2);
        assert_eq!(
            read(&fixture, "a.md"),
            "---\nid: a1\n---\n# A\nUses [[JPA]] and [[JPA#Setup|the ORM]].\n```\n[[Hibernate]]\n```\n"
        );
        assert_eq!(read(&fixture, "c.md"), "---\nid: c1\n---\n# C\n[[JPA]]\n");
        assert_eq!(
            read(&fixture, "b.md"),
            "---\nid: b1\n---\n# B\nNo link here.\n"
        );
        assert_eq!(link_keys(&fixture, "a1"), ["jpa"]);
        assert_eq!(link_keys(&fixture, "c1"), ["jpa"]);
    }

    #[test]
    fn rename_skips_a_linking_note_that_became_unreadable_and_still_rewrites_the_others() {
        let fixture = fixture();
        let target = new_note(&fixture, None, "Hibernate");
        write(&fixture, "a.md", "---\nid: a1\n---\n# A\n[[Hibernate]]\n");
        write(&fixture, "c.md", "---\nid: c1\n---\n# C\n[[Hibernate]]\n");
        reindex(&fixture.state).expect("indexes");
        let broken = [0xff, 0xfe, 0xfd];
        fs::write(fixture.vault.path().join("a.md"), broken).expect("corrupts");

        let result = rename(&fixture.state, &target.id, "JPA").expect("renames");

        assert_eq!(result.rewritten_notes, 1);
        assert_eq!(read(&fixture, "c.md"), "---\nid: c1\n---\n# C\n[[JPA]]\n");
        assert_eq!(
            fs::read(fixture.vault.path().join("a.md")).expect("reads"),
            broken
        );
    }

    #[test]
    fn rename_also_updates_links_the_note_has_to_itself() {
        let fixture = fixture();
        let note = new_note(&fixture, None, "Self");
        let opened = get(&fixture.state, &note.id).expect("reads");
        save(
            &fixture.state,
            &note.id,
            save_input("# Self\nSee [[Self]] again.\n", &opened.hash),
        )
        .expect("saves");

        let result = rename(&fixture.state, &note.id, "Mirror").expect("renames");

        assert_eq!(result.rewritten_notes, 1);
        assert!(read(&fixture, "Mirror.md").contains("See [[Mirror]] again."));
    }

    #[test]
    fn rename_leaves_links_alone_when_another_note_still_has_the_old_title() {
        let fixture = fixture();
        let first = new_note(&fixture, None, "Twin");
        write(&fixture, "sub/Twin.md", "---\nid: twin2\n---\n# Twin\n");
        write(
            &fixture,
            "linker.md",
            "---\nid: l1\n---\n# Linker\n[[Twin]]\n",
        );
        reindex(&fixture.state).expect("indexes");

        let result = rename(&fixture.state, &first.id, "Different").expect("renames");

        assert_eq!(result.rewritten_notes, 0);
        assert!(read(&fixture, "linker.md").contains("[[Twin]]"));
    }

    #[test]
    fn a_rename_that_only_changes_the_case_works_and_does_not_touch_other_notes() {
        let fixture = fixture();
        let note = new_note(&fixture, None, "case note");
        write(
            &fixture,
            "other.md",
            "---\nid: o1\n---\n# Other\n[[case note]]\n",
        );
        reindex(&fixture.state).expect("indexes");

        let result = rename(&fixture.state, &note.id, "Case Note").expect("renames");

        assert_eq!(result.note.path, "Case Note.md");
        assert_eq!(result.rewritten_notes, 0);
        assert!(read(&fixture, "other.md").contains("[[case note]]"));
        assert_eq!(all_paths(&fixture), ["Case Note.md", "other.md"]);
    }

    #[test]
    fn renaming_a_note_whose_title_comes_from_the_file_name_renames_the_file() {
        let fixture = fixture();
        write(
            &fixture,
            "untitled.md",
            "---\nid: u1\n---\nno heading here\n",
        );
        reindex(&fixture.state).expect("indexes");

        let result = rename(&fixture.state, "u1", "Proper title").expect("renames");

        assert_eq!(result.note.path, "Proper title.md");
        assert_eq!(result.note.title, "Proper title");
        assert_eq!(
            read(&fixture, "Proper title.md"),
            "---\nid: u1\n---\nno heading here\n"
        );
    }

    #[test]
    fn rename_to_the_same_title_is_a_no_op_and_to_an_existing_file_a_conflict() {
        let fixture = fixture();
        let one = new_note(&fixture, None, "One");
        new_note(&fixture, None, "Two");
        let before = entries(&fixture).len();

        let same = rename(&fixture.state, &one.id, "One").expect("no-op");
        let clash = rename(&fixture.state, &one.id, "two");
        let invalid = rename(&fixture.state, &one.id, "a/b");
        let missing = rename(&fixture.state, "ghost", "x");

        assert_eq!(
            (same.note.path.as_str(), same.rewritten_notes),
            ("One.md", 0)
        );
        assert!(matches!(clash, Err(AppError::Conflict(_))));
        assert!(matches!(invalid, Err(AppError::Validation(_))));
        assert!(matches!(missing, Err(AppError::NotFound(_))));
        assert_eq!(entries(&fixture).len(), before);
        assert_eq!(all_paths(&fixture), ["One.md", "Two.md"]);
    }

    #[test]
    fn rename_keeps_the_frontmatter_bytes_and_the_rest_of_the_body() {
        let fixture = fixture();
        write(
            &fixture,
            "k.md",
            "---\nid: k1\naliases:\n  - First\ncolor: red\n---\nintro\n\n# Keep\n\nmiddle [[Keep]]\n\nend\n",
        );
        reindex(&fixture.state).expect("indexes");

        rename(&fixture.state, "k1", "Kept").expect("renames");

        assert_eq!(
            read(&fixture, "Kept.md"),
            "---\nid: k1\naliases:\n  - First\ncolor: red\n---\nintro\n\n# Kept\n\nmiddle [[Kept]]\n\nend\n"
        );
    }

    #[test]
    fn move_relocates_the_file_and_keeps_id_links_and_content() {
        let fixture = fixture();
        let note = new_note(&fixture, None, "Mover");
        fs::create_dir_all(fixture.vault.path().join("Archive")).expect("creates dir");
        let before = read(&fixture, "Mover.md");

        let moved = move_note(&fixture.state, &note.id, Some("Archive")).expect("moves");
        let back = move_note(&fixture.state, &note.id, None).expect("moves back");

        assert_eq!(moved.path, "Archive/Mover.md");
        assert_eq!(back.path, "Mover.md");
        assert_eq!(moved.id, note.id);
        assert_eq!(read(&fixture, "Mover.md"), before);
    }

    #[test]
    fn move_rejects_name_clashes_missing_folders_and_ignores_the_same_folder() {
        let fixture = fixture();
        let note = new_note(&fixture, None, "Same");
        write(&fixture, "dir/Same.md", "# Same\n");
        reindex(&fixture.state).expect("indexes");
        let before = entries(&fixture).len();

        let clash = move_note(&fixture.state, &note.id, Some("dir"));
        let missing = move_note(&fixture.state, &note.id, Some("ghost"));
        let reserved = move_note(&fixture.state, &note.id, Some("attachments"));
        let same = move_note(&fixture.state, &note.id, None).expect("no-op");

        assert!(matches!(clash, Err(AppError::Conflict(_))));
        assert!(matches!(missing, Err(AppError::NotFound(_))));
        assert!(matches!(reserved, Err(AppError::Validation(_))));
        assert_eq!(same.path, "Same.md");
        assert_eq!(entries(&fixture).len(), before);
    }

    #[test]
    fn delete_removes_the_file_the_index_rows_and_leaves_incoming_links_unresolved() {
        let fixture = fixture();
        let doomed = new_note(&fixture, None, "Doomed");
        write(
            &fixture,
            "linker.md",
            "---\nid: l1\n---\n# Linker\n[[Doomed]]\n",
        );
        reindex(&fixture.state).expect("indexes");

        delete(&fixture.state, &doomed.id).expect("deletes");

        assert!(!fixture.vault.path().join("Doomed.md").exists());
        assert_eq!(all_paths(&fixture), ["linker.md"]);
        assert!(read(&fixture, "linker.md").contains("[[Doomed]]"));
        assert_eq!(link_keys(&fixture, "l1"), ["doomed"]);
        assert!(matches!(
            delete(&fixture.state, &doomed.id),
            Err(AppError::NotFound(_))
        ));
    }

    #[test]
    fn delete_succeeds_even_if_the_file_was_already_removed() {
        let fixture = fixture();
        let note = new_note(&fixture, None, "Vanished");
        fs::remove_file(fixture.vault.path().join("Vanished.md")).expect("removes file");

        assert!(delete(&fixture.state, &note.id).is_ok());
        assert!(all_paths(&fixture).is_empty());
    }

    #[test]
    fn creating_renaming_moving_and_deleting_are_logged_but_saving_is_not() {
        let fixture = fixture();
        let note = new_note(&fixture, None, "Logged");
        fs::create_dir_all(fixture.vault.path().join("dir")).expect("creates dir");
        save(
            &fixture.state,
            &note.id,
            save_input("# Logged\nx\n", &note.hash),
        )
        .expect("saves");
        rename(&fixture.state, &note.id, "Renamed").expect("renames");
        move_note(&fixture.state, &note.id, Some("dir")).expect("moves");
        delete(&fixture.state, &note.id).expect("deletes");

        let logged = entries(&fixture);

        let actions: Vec<ActivityAction> = logged.iter().map(|entry| entry.action).collect();
        assert_eq!(
            actions,
            [
                ActivityAction::Created,
                ActivityAction::Updated,
                ActivityAction::Moved,
                ActivityAction::Deleted
            ]
        );
        assert!(logged.iter().all(|entry| entry.entity_id == note.id));
        let renamed = logged[1].changes.as_ref().expect("has changes");
        assert_eq!(renamed["title"].from.as_deref(), Some("Logged"));
        assert_eq!(renamed["title"].to.as_deref(), Some("Renamed"));
    }

    #[test]
    fn unicode_titles_work_end_to_end() {
        let fixture = fixture();
        let note = new_note(&fixture, None, "Ação rápida");
        write(
            &fixture,
            "ref.md",
            "---\nid: r1\n---\n# Ref\n[[ação RÁPIDA]]\n",
        );
        reindex(&fixture.state).expect("indexes");

        let result = rename(&fixture.state, &note.id, "日本語のノート").expect("renames");

        assert_eq!(result.note.path, "日本語のノート.md");
        assert_eq!(result.rewritten_notes, 1);
        assert!(read(&fixture, "ref.md").contains("[[日本語のノート]]"));
    }

    #[test]
    fn tag_normalization_trims_strips_hashes_and_dedupes_ignoring_case() {
        let tags = normalize_tags(vec![
            " #a ".into(),
            "A".into(),
            "b".into(),
            "#".into(),
            "".into(),
        ])
        .expect("valid");

        assert_eq!(tags, ["a", "b"]);
    }
}
