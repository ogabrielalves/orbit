use std::ffi::OsStr;
use std::fs::File;
use std::io::{self, Read};
use std::path::{Path, PathBuf};

use rusqlite::Connection;

use super::file_types::{extension_of, mime_for_extension};
use super::models::Attachment;
use super::repository::{self, StoredAttachment};
use crate::error::{AppError, AppResult};
use crate::modules::activity::models::{ActivityAction, ChangeSet, EntityType};
use crate::modules::activity::service as activity;
use crate::modules::tasks::repository as task_repository;
use crate::shared::text::require_text;
use crate::shared::{files, id, time};
use crate::state::AppState;

pub const MAX_ATTACHMENT_BYTES: u64 = 50 * 1024 * 1024;
pub const MAX_ATTACHMENTS_PER_TASK: u32 = 50;
pub const FILE_NAME_MAX_LENGTH: usize = 255;
const PARTIAL_SUFFIX: &str = ".part";

pub fn import(state: &AppState, task_id: &str, source_path: &str) -> AppResult<Attachment> {
    import_with_limit(state, task_id, source_path, MAX_ATTACHMENT_BYTES)
}

fn import_with_limit(
    state: &AppState,
    task_id: &str,
    source_path: &str,
    max_bytes: u64,
) -> AppResult<Attachment> {
    let directory = attachments_directory(state)?;
    let source = parse_source(source_path)?;
    let metadata = std::fs::metadata(&source).map_err(source_error)?;
    let is_regular_file = metadata.is_file();
    if !is_regular_file {
        return Err(AppError::Validation(
            "the selected path is not a file".into(),
        ));
    }
    let too_large = metadata.len() > max_bytes;
    if too_large {
        return Err(too_large_error(max_bytes));
    }

    let file_name = display_name(&source)?;
    let extension = extension_of(&file_name)
        .ok_or_else(|| AppError::Validation("files without an extension are not allowed".into()))?;
    let mime_type = mime_for_extension(&extension).ok_or_else(|| {
        AppError::Validation(format!("files of type '.{extension}' are not allowed"))
    })?;

    let mut connection = state.database();
    let transaction = connection.transaction()?;
    ensure_task_has_room(&transaction, task_id)?;

    let attachment_id = id::new_id();
    let stored_name = format!("{attachment_id}.{extension}");
    let size = copy_into(directory, &source, &stored_name, max_bytes)?;
    let stored_path = directory.join(&stored_name);

    let saved = save(
        &transaction,
        task_id,
        attachment_id,
        file_name,
        stored_name,
        mime_type,
        size,
    );
    let attachment = match saved.and_then(|attachment| {
        transaction.commit()?;
        Ok(attachment)
    }) {
        Ok(attachment) => attachment,
        Err(error) => {
            discard(&stored_path);
            return Err(error);
        }
    };
    Ok(attachment)
}

pub fn list(state: &AppState, task_id: &str) -> AppResult<Vec<Attachment>> {
    let connection = state.database();
    ensure_task_exists(&connection, task_id)?;
    repository::list_by_task(&connection, task_id)
}

pub fn remove(state: &AppState, id: &str) -> AppResult<()> {
    let stored_name = {
        let mut connection = state.database();
        let transaction = connection.transaction()?;
        let stored = find_existing(&transaction, id)?;
        let mut changes = ChangeSet::new();
        changes.track("file", Some(stored.attachment.file_name.as_str()), None);
        record(&transaction, id, ActivityAction::Deleted, changes)?;
        repository::delete(&transaction, id)?;
        transaction.commit()?;
        stored.stored_name
    };

    if let Some(directory) = state.attachments_directory() {
        files::remove_stored_files(directory, &[stored_name]);
    }
    Ok(())
}

pub fn path_for_open(state: &AppState, id: &str) -> AppResult<PathBuf> {
    let directory = attachments_directory(state)?;
    let stored = {
        let connection = state.database();
        find_existing(&connection, id)?
    };

    let is_plain_file_name =
        Path::new(&stored.stored_name).file_name() == Some(OsStr::new(&stored.stored_name));
    if !is_plain_file_name {
        log::error!("attachment {id} has an unsafe stored name");
        return Err(AppError::Internal);
    }
    let path = directory.join(&stored.stored_name);
    let file_is_missing = !path.is_file();
    if file_is_missing {
        return Err(AppError::NotFound("attachment file".into()));
    }
    Ok(path)
}

fn attachments_directory(state: &AppState) -> AppResult<&Path> {
    state.attachments_directory().ok_or_else(|| {
        log::error!("attachments directory is not configured");
        AppError::Internal
    })
}

fn parse_source(source_path: &str) -> AppResult<PathBuf> {
    let trimmed = source_path.trim();
    let is_blank = trimmed.is_empty();
    if is_blank {
        return Err(AppError::Validation("file path cannot be empty".into()));
    }
    Ok(PathBuf::from(trimmed))
}

fn source_error(error: io::Error) -> AppError {
    match error.kind() {
        io::ErrorKind::NotFound => AppError::NotFound("file".into()),
        _ => AppError::from(error),
    }
}

fn too_large_error(max_bytes: u64) -> AppError {
    let megabytes = max_bytes / (1024 * 1024);
    AppError::Validation(format!("the file exceeds the {megabytes} MB limit"))
}

fn display_name(source: &Path) -> AppResult<String> {
    let raw = source
        .file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_default();
    let has_no_name = raw.trim().is_empty();
    if has_no_name {
        return Err(AppError::Validation("the file has no name".into()));
    }
    require_text("file name", &raw, FILE_NAME_MAX_LENGTH)
}

fn ensure_task_exists(connection: &Connection, task_id: &str) -> AppResult<()> {
    let task_exists = task_repository::find_by_id(connection, task_id)?.is_some();
    if !task_exists {
        return Err(AppError::NotFound("task".into()));
    }
    Ok(())
}

fn ensure_task_has_room(connection: &Connection, task_id: &str) -> AppResult<()> {
    ensure_task_exists(connection, task_id)?;
    let count = repository::count_by_task(connection, task_id)?;
    let has_reached_limit = count >= MAX_ATTACHMENTS_PER_TASK;
    if has_reached_limit {
        return Err(AppError::Validation(format!(
            "a task cannot have more than {MAX_ATTACHMENTS_PER_TASK} attachments"
        )));
    }
    Ok(())
}

fn copy_into(directory: &Path, source: &Path, stored_name: &str, max_bytes: u64) -> AppResult<u32> {
    std::fs::create_dir_all(directory)?;
    let partial_path = directory.join(format!("{stored_name}{PARTIAL_SUFFIX}"));
    let final_path = directory.join(stored_name);

    let copied = write_limited(source, &partial_path, max_bytes);
    let size = match copied {
        Ok(size) => size,
        Err(error) => {
            discard(&partial_path);
            return Err(error);
        }
    };
    if let Err(error) = std::fs::rename(&partial_path, &final_path) {
        discard(&partial_path);
        return Err(error.into());
    }
    Ok(size)
}

fn write_limited(source: &Path, target: &Path, max_bytes: u64) -> AppResult<u32> {
    let input = File::open(source).map_err(source_error)?;
    let mut limited = input.take(max_bytes + 1);
    let mut output = File::create(target)?;
    let copied = io::copy(&mut limited, &mut output)?;
    output.sync_all()?;
    let too_large = copied > max_bytes;
    if too_large {
        return Err(too_large_error(max_bytes));
    }
    u32::try_from(copied).map_err(|_| too_large_error(max_bytes))
}

fn save(
    connection: &Connection,
    task_id: &str,
    attachment_id: String,
    file_name: String,
    stored_name: String,
    mime_type: &str,
    size: u32,
) -> AppResult<Attachment> {
    let attachment = Attachment {
        id: attachment_id,
        task_id: task_id.to_string(),
        file_name,
        mime_type: mime_type.to_string(),
        size_bytes: size,
        created_at: time::now(),
    };
    let stored = StoredAttachment {
        attachment,
        stored_name,
    };
    repository::insert(connection, &stored)?;
    let mut changes = ChangeSet::new();
    changes.track("file", None, Some(stored.attachment.file_name.as_str()));
    record(
        connection,
        &stored.attachment.id,
        ActivityAction::Created,
        changes,
    )?;
    Ok(stored.attachment)
}

fn discard(path: &Path) {
    if let Err(error) = std::fs::remove_file(path) {
        let was_already_gone = error.kind() == io::ErrorKind::NotFound;
        if !was_already_gone {
            log::warn!("could not remove file '{}': {error}", path.display());
        }
    }
}

fn find_existing(connection: &Connection, id: &str) -> AppResult<StoredAttachment> {
    repository::find_by_id(connection, id)?.ok_or_else(|| AppError::NotFound("attachment".into()))
}

fn record(
    connection: &Connection,
    attachment_id: &str,
    action: ActivityAction,
    changes: ChangeSet,
) -> AppResult<()> {
    activity::record(
        connection,
        EntityType::Attachment,
        attachment_id,
        action,
        changes,
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{connection::open_in_memory, migrations};
    use crate::modules::activity::models::ActivityEntry;
    use crate::modules::tasks::models::{CreateTaskInput, Task};
    use crate::modules::tasks::service as tasks;

    const NOW: &str = "2026-11-08T10:00:00.000Z";

    struct Fixture {
        state: AppState,
        attachments: tempfile::TempDir,
        sources: tempfile::TempDir,
    }

    fn fixture() -> Fixture {
        let mut connection = open_in_memory().expect("opens");
        migrations::run(&mut connection).expect("migrates");
        connection
            .execute(
                "INSERT INTO projects (id, name, created_at, updated_at) VALUES ('p1', 'P', ?1, ?1)",
                [NOW],
            )
            .expect("project");
        let attachments = tempfile::tempdir().expect("attachments dir");
        let sources = tempfile::tempdir().expect("sources dir");
        let state = AppState::new(connection, None)
            .with_attachments_directory(attachments.path().to_path_buf());
        Fixture {
            state,
            attachments,
            sources,
        }
    }

    fn task(state: &AppState, title: &str) -> Task {
        tasks::create(
            state,
            CreateTaskInput {
                project_id: "p1".into(),
                title: title.into(),
                description: None,
                priority: None,
                due_date: None,
                column_id: None,
            },
        )
        .expect("creates task")
    }

    fn source_file(fixture: &Fixture, name: &str, content: &[u8]) -> String {
        let path = fixture.sources.path().join(name);
        std::fs::write(&path, content).expect("writes source");
        path.to_string_lossy().into_owned()
    }

    fn stored_files(fixture: &Fixture) -> Vec<String> {
        let mut names: Vec<String> = std::fs::read_dir(fixture.attachments.path())
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

    fn attachment_entries(state: &AppState) -> Vec<ActivityEntry> {
        let mut all = activity::recent(state, Some(100)).expect("reads activity");
        all.reverse();
        all.into_iter()
            .filter(|entry| entry.entity_type == EntityType::Attachment)
            .collect()
    }

    fn stored_name_of(state: &AppState, id: &str) -> String {
        repository::find_by_id(&state.database(), id)
            .expect("reads")
            .expect("exists")
            .stored_name
    }

    #[test]
    fn import_copies_the_file_and_stores_its_metadata() {
        let fixture = fixture();
        let parent = task(&fixture.state, "T");
        let source = source_file(&fixture, "Spec Final.PDF", b"%PDF-content");

        let attachment = import(&fixture.state, &parent.id, &source).expect("imports");

        assert_eq!(attachment.task_id, parent.id);
        assert_eq!(attachment.file_name, "Spec Final.PDF");
        assert_eq!(attachment.mime_type, "application/pdf");
        assert_eq!(attachment.size_bytes, 12);
        let stored_name = stored_name_of(&fixture.state, &attachment.id);
        assert_eq!(stored_name, format!("{}.pdf", attachment.id));
        let copied = std::fs::read(fixture.attachments.path().join(&stored_name)).expect("reads");
        assert_eq!(copied, b"%PDF-content");
        assert_eq!(stored_files(&fixture), [stored_name]);
    }

    #[test]
    fn the_original_file_is_left_untouched() {
        let fixture = fixture();
        let parent = task(&fixture.state, "T");
        let source = source_file(&fixture, "notes.txt", b"keep me");

        import(&fixture.state, &parent.id, &source).expect("imports");

        assert_eq!(std::fs::read(&source).expect("reads"), b"keep me");
    }

    #[test]
    fn two_imports_of_the_same_file_get_distinct_stored_names() {
        let fixture = fixture();
        let parent = task(&fixture.state, "T");
        let source = source_file(&fixture, "notes.txt", b"same");

        let first = import(&fixture.state, &parent.id, &source).expect("imports");
        let second = import(&fixture.state, &parent.id, &source).expect("imports");

        assert_ne!(first.id, second.id);
        assert_eq!(stored_files(&fixture).len(), 2);
        assert_eq!(list(&fixture.state, &parent.id).expect("lists").len(), 2);
    }

    #[test]
    fn an_empty_file_can_be_attached() {
        let fixture = fixture();
        let parent = task(&fixture.state, "T");
        let source = source_file(&fixture, "empty.txt", b"");

        let attachment = import(&fixture.state, &parent.id, &source).expect("imports");

        assert_eq!(attachment.size_bytes, 0);
    }

    #[test]
    fn the_path_is_trimmed_and_blank_paths_are_rejected() {
        let fixture = fixture();
        let parent = task(&fixture.state, "T");
        let source = source_file(&fixture, "a.txt", b"x");

        let padded = import(&fixture.state, &parent.id, &format!("  {source}  "));
        let blank = import(&fixture.state, &parent.id, "   ");

        assert!(padded.is_ok());
        assert!(matches!(blank, Err(AppError::Validation(_))));
    }

    #[test]
    fn missing_files_directories_and_unknown_tasks_are_rejected_without_leaving_files() {
        let fixture = fixture();
        let parent = task(&fixture.state, "T");
        let source = source_file(&fixture, "a.txt", b"x");
        let missing = fixture
            .sources
            .path()
            .join("ghost.txt")
            .to_string_lossy()
            .into_owned();
        let directory = fixture.sources.path().to_string_lossy().into_owned();

        assert!(matches!(
            import(&fixture.state, &parent.id, &missing),
            Err(AppError::NotFound(_))
        ));
        assert!(matches!(
            import(&fixture.state, &parent.id, &directory),
            Err(AppError::Validation(_))
        ));
        assert!(matches!(
            import(&fixture.state, "ghost", &source),
            Err(AppError::NotFound(_))
        ));
        assert!(stored_files(&fixture).is_empty());
    }

    #[test]
    fn only_allowed_file_types_are_accepted() {
        let fixture = fixture();
        let parent = task(&fixture.state, "T");
        let attempt = |name: &str| {
            let source = source_file(&fixture, name, b"x");
            import(&fixture.state, &parent.id, &source)
        };

        assert!(attempt("photo.JPG").is_ok());
        for blocked in [
            "setup.exe",
            "run.bat",
            "script.ps1",
            "page.html",
            "logo.svg",
            "NOEXT",
            "trailing.",
        ] {
            assert!(
                matches!(attempt(blocked), Err(AppError::Validation(_))),
                "{blocked} should be rejected"
            );
        }
        assert_eq!(stored_files(&fixture).len(), 1);
    }

    #[test]
    fn files_over_the_limit_are_rejected_and_the_limit_itself_is_accepted() {
        let fixture = fixture();
        let parent = task(&fixture.state, "T");
        let at_limit = source_file(&fixture, "at.txt", &[b'a'; 10]);
        let over_limit = source_file(&fixture, "over.txt", &[b'a'; 11]);

        let accepted = import_with_limit(&fixture.state, &parent.id, &at_limit, 10);
        let rejected = import_with_limit(&fixture.state, &parent.id, &over_limit, 10);

        assert!(accepted.is_ok());
        assert!(matches!(rejected, Err(AppError::Validation(_))));
        assert_eq!(stored_files(&fixture).len(), 1);
    }

    #[test]
    fn a_file_that_grows_past_the_limit_while_copying_is_cut_off_and_discarded() {
        let fixture = fixture();
        let source = source_file(&fixture, "big.txt", &[b'a'; 20]);
        let target = fixture.attachments.path().join("target.part");

        let result = write_limited(Path::new(&source), &target, 10);

        assert!(matches!(result, Err(AppError::Validation(_))));
        let written = std::fs::metadata(&target).expect("partial exists").len();
        assert_eq!(written, 11);
    }

    #[test]
    fn display_names_keep_the_original_and_reject_blank_or_overlong_ones() {
        let long = format!("{}.txt", "n".repeat(FILE_NAME_MAX_LENGTH));
        let at_limit = format!("{}.txt", "n".repeat(FILE_NAME_MAX_LENGTH - 4));

        assert_eq!(
            display_name(Path::new("/tmp/My File (1).txt")).expect("accepts"),
            "My File (1).txt"
        );
        assert!(display_name(Path::new(&at_limit)).is_ok());
        assert!(matches!(
            display_name(Path::new(&long)),
            Err(AppError::Validation(_))
        ));
        assert!(matches!(
            display_name(Path::new("/")),
            Err(AppError::Validation(_))
        ));
    }

    #[test]
    fn the_per_task_limit_is_enforced_and_other_tasks_are_unaffected() {
        let fixture = fixture();
        let crowded = task(&fixture.state, "Crowded");
        let other = task(&fixture.state, "Other");
        let source = source_file(&fixture, "a.txt", b"x");
        for _ in 0..MAX_ATTACHMENTS_PER_TASK {
            import(&fixture.state, &crowded.id, &source).expect("imports");
        }

        let rejected = import(&fixture.state, &crowded.id, &source);
        let elsewhere = import(&fixture.state, &other.id, &source);

        assert!(matches!(rejected, Err(AppError::Validation(_))));
        assert!(elsewhere.is_ok());
        assert_eq!(
            stored_files(&fixture).len() as u32,
            MAX_ATTACHMENTS_PER_TASK + 1
        );
    }

    #[test]
    fn archived_tasks_and_subtasks_accept_attachments() {
        let fixture = fixture();
        let parent = task(&fixture.state, "T");
        let step = crate::modules::tasks::subtask_service::create(
            &fixture.state,
            crate::modules::tasks::models::CreateSubtaskInput {
                parent_task_id: parent.id.clone(),
                title: "Step".into(),
            },
        )
        .expect("creates subtask");
        tasks::archive(&fixture.state, &parent.id).expect("archives");
        let source = source_file(&fixture, "a.txt", b"x");

        assert!(import(&fixture.state, &parent.id, &source).is_ok());
        assert!(import(&fixture.state, &step.id, &source).is_ok());
    }

    #[test]
    fn a_failure_after_the_copy_removes_the_copied_file_and_leaves_no_row() {
        let fixture = fixture();
        let parent = task(&fixture.state, "T");
        let source = source_file(&fixture, "a.txt", b"x");
        fixture
            .state
            .database()
            .execute_batch("DROP TABLE activity_log;")
            .expect("drops log table");

        let result = import(&fixture.state, &parent.id, &source);

        assert!(result.is_err());
        assert!(stored_files(&fixture).is_empty());
        assert_eq!(
            repository::count_by_task(&fixture.state.database(), &parent.id).expect("counts"),
            0
        );
    }

    #[test]
    fn import_requires_a_configured_attachments_directory() {
        let mut connection = open_in_memory().expect("opens");
        migrations::run(&mut connection).expect("migrates");
        let state = AppState::new(connection, None);

        let result = import(&state, "t1", "whatever.txt");

        assert!(matches!(result, Err(AppError::Internal)));
    }

    #[test]
    fn import_logs_one_created_entry_with_the_file_name() {
        let fixture = fixture();
        let parent = task(&fixture.state, "T");
        let source = source_file(&fixture, "spec.pdf", b"x");

        let attachment = import(&fixture.state, &parent.id, &source).expect("imports");

        let logged = attachment_entries(&fixture.state);
        assert_eq!(logged.len(), 1);
        assert_eq!(logged[0].entity_id, attachment.id);
        assert_eq!(logged[0].action, ActivityAction::Created);
        assert_eq!(
            logged[0].changes.as_ref().expect("has changes")["file"]
                .to
                .as_deref(),
            Some("spec.pdf")
        );
    }

    #[test]
    fn list_is_scoped_per_task_and_rejects_unknown_tasks() {
        let fixture = fixture();
        let one = task(&fixture.state, "One");
        let two = task(&fixture.state, "Two");
        let source = source_file(&fixture, "a.txt", b"x");
        import(&fixture.state, &one.id, &source).expect("imports");

        assert_eq!(list(&fixture.state, &one.id).expect("lists").len(), 1);
        assert!(list(&fixture.state, &two.id).expect("lists").is_empty());
        assert!(matches!(
            list(&fixture.state, "ghost"),
            Err(AppError::NotFound(_))
        ));
    }

    #[test]
    fn remove_deletes_the_row_and_then_the_file_and_logs_it() {
        let fixture = fixture();
        let parent = task(&fixture.state, "T");
        let source = source_file(&fixture, "a.txt", b"x");
        let kept = import(&fixture.state, &parent.id, &source).expect("imports");
        let doomed = import(&fixture.state, &parent.id, &source).expect("imports");

        remove(&fixture.state, &doomed.id).expect("removes");

        let remaining = list(&fixture.state, &parent.id).expect("lists");
        assert_eq!(remaining, std::slice::from_ref(&kept));
        assert_eq!(
            stored_files(&fixture),
            [stored_name_of(&fixture.state, &kept.id)]
        );
        let logged = attachment_entries(&fixture.state);
        let last = logged.last().expect("has entries");
        assert_eq!(last.action, ActivityAction::Deleted);
        assert_eq!(last.entity_id, doomed.id);
    }

    #[test]
    fn remove_of_an_unknown_attachment_is_not_found_and_touches_nothing() {
        let fixture = fixture();
        let parent = task(&fixture.state, "T");
        let source = source_file(&fixture, "a.txt", b"x");
        import(&fixture.state, &parent.id, &source).expect("imports");

        let result = remove(&fixture.state, "ghost");

        assert!(matches!(result, Err(AppError::NotFound(_))));
        assert_eq!(stored_files(&fixture).len(), 1);
    }

    #[test]
    fn remove_succeeds_even_when_the_stored_file_is_already_gone() {
        let fixture = fixture();
        let parent = task(&fixture.state, "T");
        let source = source_file(&fixture, "a.txt", b"x");
        let attachment = import(&fixture.state, &parent.id, &source).expect("imports");
        let stored_name = stored_name_of(&fixture.state, &attachment.id);
        std::fs::remove_file(fixture.attachments.path().join(stored_name)).expect("removes file");

        assert!(remove(&fixture.state, &attachment.id).is_ok());
        assert!(list(&fixture.state, &parent.id).expect("lists").is_empty());
    }

    #[test]
    fn a_failed_removal_keeps_the_row_and_the_file() {
        let fixture = fixture();
        let parent = task(&fixture.state, "T");
        let source = source_file(&fixture, "a.txt", b"x");
        let attachment = import(&fixture.state, &parent.id, &source).expect("imports");
        fixture
            .state
            .database()
            .execute_batch("DROP TABLE activity_log;")
            .expect("drops log table");

        let result = remove(&fixture.state, &attachment.id);

        assert!(result.is_err());
        assert_eq!(stored_files(&fixture).len(), 1);
        assert_eq!(list(&fixture.state, &parent.id).expect("lists").len(), 1);
    }

    #[test]
    fn deleting_the_task_removes_its_attachment_files_including_those_of_its_subtasks() {
        let fixture = fixture();
        let parent = task(&fixture.state, "T");
        let step = crate::modules::tasks::subtask_service::create(
            &fixture.state,
            crate::modules::tasks::models::CreateSubtaskInput {
                parent_task_id: parent.id.clone(),
                title: "Step".into(),
            },
        )
        .expect("creates subtask");
        let source = source_file(&fixture, "a.txt", b"x");
        import(&fixture.state, &parent.id, &source).expect("imports");
        import(&fixture.state, &step.id, &source).expect("imports");

        tasks::delete(&fixture.state, &parent.id).expect("deletes");

        assert!(stored_files(&fixture).is_empty());
    }

    #[test]
    fn path_for_open_points_at_the_stored_file() {
        let fixture = fixture();
        let parent = task(&fixture.state, "T");
        let source = source_file(&fixture, "a.txt", b"hello");
        let attachment = import(&fixture.state, &parent.id, &source).expect("imports");

        let path = path_for_open(&fixture.state, &attachment.id).expect("resolves");

        assert!(path.starts_with(fixture.attachments.path()));
        assert_eq!(std::fs::read(path).expect("reads"), b"hello");
    }

    #[test]
    fn path_for_open_fails_for_unknown_ids_and_missing_files() {
        let fixture = fixture();
        let parent = task(&fixture.state, "T");
        let source = source_file(&fixture, "a.txt", b"x");
        let attachment = import(&fixture.state, &parent.id, &source).expect("imports");
        let stored_name = stored_name_of(&fixture.state, &attachment.id);
        std::fs::remove_file(fixture.attachments.path().join(stored_name)).expect("removes file");

        assert!(matches!(
            path_for_open(&fixture.state, "ghost"),
            Err(AppError::NotFound(_))
        ));
        assert!(matches!(
            path_for_open(&fixture.state, &attachment.id),
            Err(AppError::NotFound(_))
        ));
    }

    #[test]
    fn path_for_open_never_leaves_the_attachments_directory() {
        let fixture = fixture();
        let parent = task(&fixture.state, "T");
        let outside = source_file(&fixture, "outside.txt", b"secret");
        fixture
            .state
            .database()
            .execute(
                "INSERT INTO attachments (id, task_id, file_name, stored_name, mime_type, size_bytes, created_at)
                 VALUES ('evil', ?1, 'x.txt', ?2, 'text/plain', 1, ?3)",
                (&parent.id, &outside, NOW),
            )
            .expect("inserts crafted row");

        let result = path_for_open(&fixture.state, "evil");

        assert!(matches!(result, Err(AppError::Internal)));
    }
}
