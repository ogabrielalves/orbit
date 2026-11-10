use std::fs::{self, File};
use std::io::Read;
use std::path::{Path, PathBuf};
use std::time::Duration;

use chrono::Utc;
use rusqlite::backup::Backup;
use rusqlite::{Connection, OpenFlags};

use super::models::{BackupFile, ExportBackupInput, ImportBackupInput, ImportReport};
use crate::db::migrations;
use crate::error::{AppError, AppResult};
use crate::modules::notes::vault_service;
use crate::modules::settings::service as settings;
use crate::shared::id;
use crate::state::AppState;

pub const MAX_BACKUP_BYTES: u64 = 1024 * 1024 * 1024;
pub const SAFETY_BACKUPS_DIRECTORY: &str = "backups";
pub const SAFETY_BACKUPS_KEPT: usize = 5;
const SAFETY_BACKUP_PREFIX: &str = "pre-import-";
const SQLITE_HEADER: &[u8; 16] = b"SQLite format 3\0";
const PAGES_PER_STEP: i32 = 256;
const REQUIRED_TABLE: &str = "settings";

pub fn export(state: &AppState, input: ExportBackupInput) -> AppResult<BackupFile> {
    let destination = parse_absolute_path(&input.destination_path, "backup destination")?;
    let file_name = destination
        .file_name()
        .ok_or_else(|| AppError::Validation("the backup destination has no file name".into()))?
        .to_os_string();
    let parent = destination
        .parent()
        .ok_or_else(|| AppError::Validation("the backup destination has no folder".into()))?;
    let parent_is_a_folder = parent.is_dir();
    if !parent_is_a_folder {
        return Err(AppError::NotFound("backup destination folder".into()));
    }

    let connection = state.database();
    let would_overwrite_the_live_database =
        live_database_path(&connection).is_some_and(|live| is_same_file(&live, &destination));
    if would_overwrite_the_live_database {
        return Err(AppError::Validation(
            "the backup cannot replace the database ORBIT is using".into(),
        ));
    }
    if destination.is_dir() {
        return Err(AppError::Validation(
            "the backup destination is a folder, not a file".into(),
        ));
    }
    let already_exists = destination.exists();
    if already_exists && !input.overwrite {
        return Err(AppError::Conflict(
            "a file already exists at the backup destination".into(),
        ));
    }

    let temporary = parent.join(format!(".orbit-backup-{}.tmp", id::new_id()));
    let written = copy_database_to(&connection, &temporary);
    if let Err(error) = written {
        remove_quietly(&temporary);
        return Err(error);
    }
    if let Err(error) = fs::rename(&temporary, parent.join(&file_name)) {
        remove_quietly(&temporary);
        return Err(error.into());
    }

    let size = fs::metadata(&destination)?.len();
    Ok(BackupFile {
        path: destination.to_string_lossy().into_owned(),
        size_bytes: u32::try_from(size).unwrap_or(u32::MAX),
    })
}

pub fn import(state: &AppState, input: ImportBackupInput) -> AppResult<ImportReport> {
    import_with_limit(state, input, MAX_BACKUP_BYTES)
}

fn import_with_limit(
    state: &AppState,
    input: ImportBackupInput,
    max_bytes: u64,
) -> AppResult<ImportReport> {
    let source = parse_absolute_path(&input.source_path, "backup file")?;
    check_file(&source, max_bytes)?;

    let (staged, backup_version) = stage(&source)?;
    let current_version = latest_schema_version()?;

    let mut live = state.database();
    let safety_backup = write_safety_backup(&live)?;
    replace_contents(&mut live, &staged)?;
    drop(live);

    refresh_after_import(state);
    Ok(ImportReport {
        backup_schema_version: backup_version,
        current_schema_version: current_version,
        was_upgraded: backup_version < current_version,
        safety_backup_path: safety_backup.map(|path| path.to_string_lossy().into_owned()),
    })
}

fn parse_absolute_path(text: &str, label: &str) -> AppResult<PathBuf> {
    let trimmed = text.trim();
    let is_blank = trimmed.is_empty();
    if is_blank {
        return Err(AppError::Validation(format!(
            "the {label} path cannot be empty"
        )));
    }
    let path = PathBuf::from(trimmed);
    let is_relative = !path.is_absolute();
    if is_relative {
        return Err(AppError::Validation(format!(
            "the {label} path must be an absolute path"
        )));
    }
    Ok(path)
}

fn live_database_path(connection: &Connection) -> Option<PathBuf> {
    let path = connection.path()?;
    let is_in_memory = path.is_empty();
    (!is_in_memory).then(|| PathBuf::from(path))
}

fn is_same_file(first: &Path, second: &Path) -> bool {
    match (fs::canonicalize(first), canonical_target(second)) {
        (Ok(left), Some(right)) => left == right,
        _ => false,
    }
}

fn canonical_target(path: &Path) -> Option<PathBuf> {
    if path.exists() {
        return fs::canonicalize(path).ok();
    }
    let parent = fs::canonicalize(path.parent()?).ok()?;
    Some(parent.join(path.file_name()?))
}

fn copy_database_to(connection: &Connection, target: &Path) -> AppResult<()> {
    let target_text = target.to_string_lossy().into_owned();
    connection.execute("VACUUM INTO ?1", [target_text])?;
    Ok(())
}

fn check_file(path: &Path, max_bytes: u64) -> AppResult<()> {
    let metadata = fs::metadata(path).map_err(|error| match error.kind() {
        std::io::ErrorKind::NotFound => AppError::NotFound("backup file".into()),
        _ => AppError::from(error),
    })?;
    if !metadata.is_file() {
        return Err(AppError::Validation("the backup path is not a file".into()));
    }
    if metadata.len() == 0 {
        return Err(AppError::Validation("the backup file is empty".into()));
    }
    let is_too_large = metadata.len() > max_bytes;
    if is_too_large {
        return Err(AppError::Validation("the backup file is too large".into()));
    }
    let mut header = [0u8; 16];
    let mut file = File::open(path)?;
    let has_header = file.read_exact(&mut header).is_ok() && &header == SQLITE_HEADER;
    if !has_header {
        return Err(not_a_backup());
    }
    Ok(())
}

fn not_a_backup() -> AppError {
    AppError::Validation("the file is not a valid ORBIT backup".into())
}

fn invalid_backup(error: impl std::fmt::Display) -> AppError {
    log::warn!("rejected backup: {error}");
    not_a_backup()
}

fn stage(source: &Path) -> AppResult<(Connection, u32)> {
    let origin = Connection::open_with_flags(source, OpenFlags::SQLITE_OPEN_READ_ONLY)
        .map_err(invalid_backup)?;
    let mut staged = Connection::open_in_memory().map_err(invalid_backup)?;
    {
        let copy = Backup::new(&origin, &mut staged).map_err(invalid_backup)?;
        copy.run_to_completion(PAGES_PER_STEP, Duration::ZERO, None)
            .map_err(invalid_backup)?;
    }
    drop(origin);

    ensure_healthy(&staged)?;
    let has_the_orbit_tables = has_table(&staged, REQUIRED_TABLE).map_err(invalid_backup)?;
    let backup_version = schema_version(&staged).map_err(invalid_backup)?;
    if !has_the_orbit_tables || backup_version == 0 {
        return Err(not_a_backup());
    }
    let latest = latest_schema_version()?;
    let is_from_a_newer_version = backup_version > latest;
    if is_from_a_newer_version {
        return Err(AppError::Validation(
            "the backup was made by a newer version of ORBIT".into(),
        ));
    }

    staged
        .execute_batch("PRAGMA foreign_keys = ON;")
        .map_err(invalid_backup)?;
    migrations::run(&mut staged).map_err(|error| {
        log::warn!("could not upgrade the backup: {error}");
        AppError::Validation("the backup could not be upgraded to this version".into())
    })?;
    ensure_healthy(&staged)?;
    Ok((staged, backup_version))
}

fn ensure_healthy(connection: &Connection) -> AppResult<()> {
    let integrity = integrity_problems(connection).map_err(invalid_backup)?;
    if !integrity.is_empty() {
        log::warn!("backup failed the integrity check: {integrity:?}");
        return Err(not_a_backup());
    }
    let broken_references = foreign_key_problems(connection).map_err(invalid_backup)?;
    if broken_references > 0 {
        return Err(AppError::Validation(
            "the backup has records that point to missing data".into(),
        ));
    }
    Ok(())
}

pub fn integrity_problems(connection: &Connection) -> rusqlite::Result<Vec<String>> {
    let mut statement = connection.prepare("PRAGMA integrity_check")?;
    let rows = statement.query_map([], |row| row.get::<_, String>(0))?;
    let messages = rows.collect::<Result<Vec<_>, _>>()?;
    let is_ok = messages.len() == 1 && messages[0] == "ok";
    Ok(if is_ok { Vec::new() } else { messages })
}

pub fn foreign_key_problems(connection: &Connection) -> rusqlite::Result<usize> {
    let mut statement = connection.prepare("PRAGMA foreign_key_check")?;
    let violations = statement.query_map([], |_| Ok(()))?.count();
    Ok(violations)
}

fn has_table(connection: &Connection, name: &str) -> rusqlite::Result<bool> {
    connection.query_row(
        "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?1)",
        [name],
        |row| row.get(0),
    )
}

fn schema_version(connection: &Connection) -> rusqlite::Result<u32> {
    connection.query_row("PRAGMA user_version", [], |row| row.get(0))
}

fn latest_schema_version() -> AppResult<u32> {
    let mut connection = Connection::open_in_memory()?;
    migrations::run(&mut connection)?;
    Ok(schema_version(&connection)?)
}

fn write_safety_backup(live: &Connection) -> AppResult<Option<PathBuf>> {
    let Some(live_path) = live_database_path(live) else {
        return Ok(None);
    };
    let Some(directory) = live_path
        .parent()
        .map(|parent| parent.join(SAFETY_BACKUPS_DIRECTORY))
    else {
        return Ok(None);
    };
    fs::create_dir_all(&directory)?;
    let stamp = Utc::now().format("%Y%m%d-%H%M%S");
    let short_id: String = id::new_id().chars().rev().take(6).collect();
    let target = directory.join(format!("{SAFETY_BACKUP_PREFIX}{stamp}-{short_id}.db"));
    copy_database_to(live, &target)?;
    prune_safety_backups(&directory);
    Ok(Some(target))
}

fn prune_safety_backups(directory: &Path) {
    let Ok(entries) = fs::read_dir(directory) else {
        return;
    };
    let mut names: Vec<String> = entries
        .flatten()
        .filter_map(|entry| entry.file_name().to_str().map(str::to_string))
        .filter(|name| name.starts_with(SAFETY_BACKUP_PREFIX) && name.ends_with(".db"))
        .collect();
    names.sort();
    let surplus = names.len().saturating_sub(SAFETY_BACKUPS_KEPT);
    for name in names.into_iter().take(surplus) {
        remove_quietly(&directory.join(name));
    }
}

fn replace_contents(live: &mut Connection, staged: &Connection) -> AppResult<()> {
    live.execute_batch("PRAGMA journal_mode = DELETE;")?;
    let copied = {
        let copy = Backup::new(staged, live)?;
        copy.run_to_completion(PAGES_PER_STEP, Duration::ZERO, None)
    };
    live.execute_batch("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;")?;
    copied?;
    Ok(())
}

fn refresh_after_import(state: &AppState) {
    if let Err(error) = settings::restore_vault_path(state) {
        log::warn!("could not restore the vault path after the import: {error}");
    }
    let has_a_vault = state.vault_path().is_some();
    if !has_a_vault {
        return;
    }
    if let Err(error) = vault_service::reindex(state) {
        log::warn!("could not index the vault after the import: {error}");
    }
}

fn remove_quietly(path: &Path) {
    if let Err(error) = fs::remove_file(path) {
        let was_already_gone = error.kind() == std::io::ErrorKind::NotFound;
        if !was_already_gone {
            log::warn!("could not remove '{}': {error}", path.display());
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::bootstrap::initialize_state;
    use crate::modules::favorites::models::{FavoriteRef, FavoriteType};
    use crate::modules::favorites::service as favorites;
    use crate::modules::projects::models::CreateProjectInput;
    use crate::modules::projects::service as projects;
    use crate::modules::settings::models::{Language, UpdateSettingsInput};
    use crate::modules::tasks::models::CreateTaskInput;
    use crate::modules::tasks::service as tasks;

    struct Workspace {
        data: tempfile::TempDir,
        state: AppState,
    }

    fn workspace() -> Workspace {
        let data = tempfile::tempdir().expect("data dir");
        let state = initialize_state(data.path()).expect("starts");
        Workspace { data, state }
    }

    fn add_project(state: &AppState, name: &str) -> String {
        projects::create(
            state,
            CreateProjectInput {
                name: name.into(),
                description: None,
                icon: None,
                color: None,
            },
        )
        .expect("creates project")
        .id
    }

    fn add_task(state: &AppState, project_id: &str, title: &str) -> String {
        tasks::create(
            state,
            CreateTaskInput {
                project_id: project_id.into(),
                title: title.into(),
                description: None,
                priority: None,
                due_date: None,
                column_id: None,
            },
        )
        .expect("creates task")
        .id
    }

    fn project_names(state: &AppState) -> Vec<String> {
        let mut names: Vec<String> = state
            .database()
            .prepare("SELECT name FROM projects ORDER BY name")
            .expect("prepares")
            .query_map([], |row| row.get::<_, String>(0))
            .expect("runs")
            .collect::<Result<_, _>>()
            .expect("reads");
        names.sort();
        names
    }

    fn count(state: &AppState, table: &str) -> i64 {
        state
            .database()
            .query_row(&format!("SELECT COUNT(*) FROM {table}"), [], |row| {
                row.get(0)
            })
            .expect("counts")
    }

    fn export_to(state: &AppState, path: &Path, overwrite: bool) -> AppResult<BackupFile> {
        export(
            state,
            ExportBackupInput {
                destination_path: path.to_string_lossy().into_owned(),
                overwrite,
            },
        )
    }

    fn import_from(state: &AppState, path: &Path) -> AppResult<ImportReport> {
        import(
            state,
            ImportBackupInput {
                source_path: path.to_string_lossy().into_owned(),
            },
        )
    }

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

    fn safety_backups(workspace: &Workspace) -> Vec<String> {
        let directory = workspace.data.path().join(SAFETY_BACKUPS_DIRECTORY);
        if !directory.exists() {
            return Vec::new();
        }
        entries(&directory)
    }

    fn old_schema_backup(directory: &Path, version: usize, with_orphan: bool) -> PathBuf {
        let path = directory.join(format!("old-{version}.db"));
        let mut connection = Connection::open_in_memory().expect("opens");
        let migrations_dir = rusqlite_migration::Migrations::from_slice(OLD_MIGRATIONS);
        migrations_dir
            .to_version(&mut connection, version)
            .expect("migrates");
        connection
            .execute(
                "INSERT INTO projects (id, name, created_at, updated_at) VALUES ('p-old', 'Legacy project', 'x', 'x')",
                [],
            )
            .expect("inserts");
        if with_orphan {
            connection
                .execute_batch("PRAGMA foreign_keys = OFF;")
                .expect("pragma");
            connection
                .execute(
                    "INSERT INTO tasks (id, project_id, title, position, created_at, updated_at) VALUES ('t-orphan', 'ghost', 'T', 'V', 'x', 'x')",
                    [],
                )
                .expect("inserts orphan");
        }
        connection
            .execute("VACUUM INTO ?1", [path.to_string_lossy().into_owned()])
            .expect("writes backup");
        path
    }

    const OLD_MIGRATIONS: &[rusqlite_migration::M<'static>] = &[
        rusqlite_migration::M::up(include_str!("../../../migrations/0001_init.sql")),
        rusqlite_migration::M::up(include_str!("../../../migrations/0002_projects.sql")),
        rusqlite_migration::M::up(include_str!("../../../migrations/0003_boards_columns.sql")),
        rusqlite_migration::M::up(include_str!("../../../migrations/0004_tasks.sql")),
        rusqlite_migration::M::up(include_str!("../../../migrations/0005_task_details.sql")),
        rusqlite_migration::M::up(include_str!("../../../migrations/0006_activity_log.sql")),
        rusqlite_migration::M::up(include_str!("../../../migrations/0007_column_kind.sql")),
        rusqlite_migration::M::up(include_str!(
            "../../../migrations/0008_activity_task_id.sql"
        )),
        rusqlite_migration::M::up(include_str!("../../../migrations/0009_notes.sql")),
        rusqlite_migration::M::up(include_str!("../../../migrations/0010_search.sql")),
        rusqlite_migration::M::up(include_str!("../../../migrations/0011_favorites.sql")),
        rusqlite_migration::M::up(include_str!("../../../migrations/0012_notes_recent.sql")),
    ];

    #[test]
    fn exporting_writes_a_valid_standalone_database_with_the_current_data() {
        let workspace = workspace();
        let project = add_project(&workspace.state, "Website");
        add_task(&workspace.state, &project, "Write copy");
        let destination = tempfile::tempdir().expect("destination");
        let target = destination.path().join("backup.db");

        let file = export_to(&workspace.state, &target, false).expect("exports");

        assert_eq!(PathBuf::from(&file.path), target);
        assert!(file.size_bytes > 0);
        assert_eq!(entries(destination.path()), ["backup.db"]);
        let copy = Connection::open(&target).expect("opens the copy");
        let projects: i64 = copy
            .query_row("SELECT COUNT(*) FROM projects", [], |row| row.get(0))
            .expect("counts");
        let tasks: i64 = copy
            .query_row("SELECT COUNT(*) FROM tasks", [], |row| row.get(0))
            .expect("counts");
        assert_eq!((projects, tasks), (1, 1));
        assert!(integrity_problems(&copy).expect("checks").is_empty());
    }

    #[test]
    fn the_copy_carries_the_schema_version_and_leaves_no_sidecar_files() {
        let workspace = workspace();
        let destination = tempfile::tempdir().expect("destination");
        let target = destination.path().join("backup.db");

        export_to(&workspace.state, &target, false).expect("exports");

        let copy = Connection::open(&target).expect("opens");
        assert_eq!(
            schema_version(&copy).expect("reads"),
            latest_schema_version().expect("latest")
        );
        assert_eq!(entries(destination.path()), ["backup.db"]);
    }

    #[test]
    fn exporting_never_replaces_an_existing_file_unless_asked() {
        let workspace = workspace();
        add_project(&workspace.state, "First");
        let destination = tempfile::tempdir().expect("destination");
        let target = destination.path().join("backup.db");
        export_to(&workspace.state, &target, false).expect("exports");
        add_project(&workspace.state, "Second");

        let refused = export_to(&workspace.state, &target, false);
        let overwritten = export_to(&workspace.state, &target, true);

        assert!(matches!(refused, Err(AppError::Conflict(_))));
        assert!(overwritten.is_ok());
        let copy = Connection::open(&target).expect("opens");
        let projects: i64 = copy
            .query_row("SELECT COUNT(*) FROM projects", [], |row| row.get(0))
            .expect("counts");
        assert_eq!(projects, 2);
        assert_eq!(entries(destination.path()), ["backup.db"]);
    }

    #[test]
    fn invalid_destinations_are_rejected_without_leaving_files() {
        let workspace = workspace();
        let destination = tempfile::tempdir().expect("destination");
        let live = workspace.data.path().join("orbit.db");

        let blank = export(
            &workspace.state,
            ExportBackupInput {
                destination_path: "  ".into(),
                overwrite: false,
            },
        );
        let relative = export(
            &workspace.state,
            ExportBackupInput {
                destination_path: "relative/backup.db".into(),
                overwrite: false,
            },
        );
        let missing_folder = export_to(
            &workspace.state,
            &destination.path().join("ghost").join("backup.db"),
            false,
        );
        let is_a_folder = export_to(&workspace.state, destination.path(), true);
        let live_database = export_to(&workspace.state, &live, true);

        assert!(matches!(blank, Err(AppError::Validation(_))));
        assert!(matches!(relative, Err(AppError::Validation(_))));
        assert!(matches!(missing_folder, Err(AppError::NotFound(_))));
        assert!(matches!(is_a_folder, Err(AppError::Validation(_))));
        assert!(matches!(live_database, Err(AppError::Validation(_))));
        assert!(entries(destination.path()).is_empty());
        assert!(
            integrity_problems(&workspace.state.database())
                .expect("checks")
                .is_empty()
        );
    }

    #[test]
    fn an_in_memory_database_can_be_exported_too() {
        let mut connection = crate::db::connection::open_in_memory().expect("opens");
        migrations::run(&mut connection).expect("migrates");
        let state = AppState::new(connection, None);
        add_project(&state, "Ephemeral");
        let destination = tempfile::tempdir().expect("destination");
        let target = destination.path().join("memory.db");

        export_to(&state, &target, false).expect("exports");

        let copy = Connection::open(&target).expect("opens");
        let projects: i64 = copy
            .query_row("SELECT COUNT(*) FROM projects", [], |row| row.get(0))
            .expect("counts");
        assert_eq!(projects, 1);
    }

    #[test]
    fn importing_replaces_everything_with_the_backup_and_keeps_a_safety_copy_of_what_was_there() {
        let source = workspace();
        let kept = add_project(&source.state, "From the backup");
        add_task(&source.state, &kept, "Backup task");
        favorites::toggle(
            &source.state,
            FavoriteRef {
                entity_type: FavoriteType::Project,
                entity_id: kept.clone(),
            },
        )
        .expect("favorites");
        settings::update(
            &source.state,
            UpdateSettingsInput {
                language: Some(Some(Language::PtBr)),
                ..Default::default()
            },
        )
        .expect("sets language");
        let folder = tempfile::tempdir().expect("folder");
        let backup = folder.path().join("orbit-backup.db");
        export_to(&source.state, &backup, false).expect("exports");

        let target = workspace();
        add_project(&target.state, "Will be replaced");
        add_project(&target.state, "Also replaced");

        let report = import_from(&target.state, &backup).expect("imports");

        assert_eq!(project_names(&target.state), ["From the backup"]);
        assert_eq!(count(&target.state, "tasks"), 1);
        assert_eq!(count(&target.state, "favorites"), 1);
        assert_eq!(
            settings::get(&target.state).expect("reads").language,
            Some(Language::PtBr)
        );
        assert!(!report.was_upgraded);
        assert_eq!(report.backup_schema_version, report.current_schema_version);
        let safety = report.safety_backup_path.expect("has a safety copy");
        let old = Connection::open(&safety).expect("opens safety copy");
        let old_names: Vec<String> = old
            .prepare("SELECT name FROM projects ORDER BY name")
            .expect("prepares")
            .query_map([], |row| row.get::<_, String>(0))
            .expect("runs")
            .collect::<Result<_, _>>()
            .expect("reads");
        assert_eq!(old_names, ["Also replaced", "Will be replaced"]);
    }

    #[test]
    fn the_live_connection_keeps_working_with_wal_and_foreign_keys_after_an_import() {
        let source = workspace();
        add_project(&source.state, "Imported");
        let folder = tempfile::tempdir().expect("folder");
        let backup = folder.path().join("b.db");
        export_to(&source.state, &backup, false).expect("exports");
        let target = workspace();

        import_from(&target.state, &backup).expect("imports");
        let created = add_project(&target.state, "Created after");

        assert_eq!(project_names(&target.state), ["Created after", "Imported"]);
        let connection = target.state.database();
        let journal: String = connection
            .query_row("PRAGMA journal_mode", [], |row| row.get(0))
            .expect("reads");
        let foreign_keys: i64 = connection
            .query_row("PRAGMA foreign_keys", [], |row| row.get(0))
            .expect("reads");
        assert_eq!(journal, "wal");
        assert_eq!(foreign_keys, 1);
        drop(connection);
        add_task(&target.state, &created, "Works");
        let orphan = target.state.database().execute(
            "INSERT INTO tasks (id, project_id, title, position, created_at, updated_at) VALUES ('x', 'ghost', 'T', 'V', 'x', 'x')",
            [],
        );
        assert!(orphan.is_err(), "foreign keys are enforced again");
    }

    #[test]
    fn a_backup_from_an_older_version_is_upgraded_and_its_data_kept() {
        let target = workspace();
        let folder = tempfile::tempdir().expect("folder");
        let backup = old_schema_backup(folder.path(), 9, false);

        let report = import_from(&target.state, &backup).expect("imports");

        assert!(report.was_upgraded);
        assert_eq!(report.backup_schema_version, 9);
        assert_eq!(
            report.current_schema_version,
            latest_schema_version().expect("latest")
        );
        assert_eq!(project_names(&target.state), ["Legacy project"]);
        let found: i64 = target
            .state
            .database()
            .query_row(
                "SELECT COUNT(*) FROM search_index WHERE search_index MATCH 'legacy'",
                [],
                |row| row.get(0),
            )
            .expect("searches");
        assert_eq!(
            found, 1,
            "tables created by later migrations are populated from the old data"
        );
        let version: u32 = target
            .state
            .database()
            .query_row("PRAGMA user_version", [], |row| row.get(0))
            .expect("reads");
        assert_eq!(version, report.current_schema_version);
    }

    fn assert_rejected_and_untouched(workspace: &Workspace, result: AppResult<ImportReport>) {
        assert!(
            matches!(
                result,
                Err(AppError::Validation(_)) | Err(AppError::NotFound(_))
            ),
            "{result:?}"
        );
        assert_eq!(project_names(&workspace.state), ["Mine"]);
        assert!(
            safety_backups(workspace).is_empty(),
            "nothing was touched, so no safety copy either"
        );
    }

    #[test]
    fn files_that_are_not_backups_are_rejected_and_the_live_data_is_untouched() {
        let target = workspace();
        add_project(&target.state, "Mine");
        let folder = tempfile::tempdir().expect("folder");
        let text = folder.path().join("notes.db");
        fs::write(&text, "just some text, not a database").expect("writes");
        let empty = folder.path().join("empty.db");
        fs::write(&empty, "").expect("writes");
        let other_sqlite = folder.path().join("other.db");
        Connection::open(&other_sqlite)
            .expect("opens")
            .execute_batch("CREATE TABLE unrelated (id INTEGER); PRAGMA user_version = 3;")
            .expect("creates");
        let no_version = folder.path().join("noversion.db");
        Connection::open(&no_version)
            .expect("opens")
            .execute_batch("CREATE TABLE settings (key TEXT, value TEXT);")
            .expect("creates");

        assert_rejected_and_untouched(&target, import_from(&target.state, &text));
        assert_rejected_and_untouched(&target, import_from(&target.state, &empty));
        assert_rejected_and_untouched(&target, import_from(&target.state, &other_sqlite));
        assert_rejected_and_untouched(&target, import_from(&target.state, &no_version));
        assert_rejected_and_untouched(&target, import_from(&target.state, folder.path()));
        assert_rejected_and_untouched(
            &target,
            import_from(&target.state, &folder.path().join("ghost.db")),
        );
    }

    #[test]
    fn blank_and_relative_source_paths_are_rejected() {
        let target = workspace();
        add_project(&target.state, "Mine");

        let blank = import(
            &target.state,
            ImportBackupInput {
                source_path: " ".into(),
            },
        );
        let relative = import(
            &target.state,
            ImportBackupInput {
                source_path: "backup.db".into(),
            },
        );

        assert_rejected_and_untouched(&target, blank);
        assert_rejected_and_untouched(&target, relative);
    }

    #[test]
    fn a_corrupted_backup_is_rejected_by_the_integrity_check() {
        let source = workspace();
        let project = add_project(&source.state, "Data");
        for index in 0..300 {
            add_task(
                &source.state,
                &project,
                &format!("Task number {index} with some padding text to fill pages"),
            );
        }
        let folder = tempfile::tempdir().expect("folder");
        let backup = folder.path().join("corrupt.db");
        export_to(&source.state, &backup, false).expect("exports");
        let mut bytes = fs::read(&backup).expect("reads");
        let middle = bytes.len() / 2;
        for byte in &mut bytes[middle..middle + 4096] {
            *byte = 0xA5;
        }
        fs::write(&backup, bytes).expect("corrupts");
        let target = workspace();
        add_project(&target.state, "Mine");

        let result = import_from(&target.state, &backup);

        assert_rejected_and_untouched(&target, result);
    }

    #[test]
    fn a_backup_made_by_a_newer_version_is_refused() {
        let folder = tempfile::tempdir().expect("folder");
        let backup = folder.path().join("future.db");
        {
            let mut connection = Connection::open(&backup).expect("opens");
            migrations::run(&mut connection).expect("migrates");
            let next = latest_schema_version().expect("latest") + 1;
            connection
                .execute_batch(&format!("PRAGMA user_version = {next};"))
                .expect("bumps");
        }
        let target = workspace();
        add_project(&target.state, "Mine");

        let result = import_from(&target.state, &backup);

        let Err(AppError::Validation(message)) = &result else {
            panic!("expected a validation error, got {result:?}");
        };
        assert!(message.contains("newer version"));
        assert_eq!(project_names(&target.state), ["Mine"]);
    }

    #[test]
    fn a_backup_with_broken_references_is_refused() {
        let folder = tempfile::tempdir().expect("folder");
        let backup = old_schema_backup(folder.path(), 12, true);
        let target = workspace();
        add_project(&target.state, "Mine");

        let result = import_from(&target.state, &backup);

        assert_rejected_and_untouched(&target, result);
    }

    #[test]
    fn a_file_over_the_size_limit_is_refused_before_it_is_read() {
        let source = workspace();
        add_project(&source.state, "Data");
        let folder = tempfile::tempdir().expect("folder");
        let backup = folder.path().join("b.db");
        let file = export_to(&source.state, &backup, false).expect("exports");
        let target = workspace();
        add_project(&target.state, "Mine");

        let too_small_limit = import_with_limit(
            &target.state,
            ImportBackupInput {
                source_path: backup.to_string_lossy().into_owned(),
            },
            u64::from(file.size_bytes) - 1,
        );
        let exact_limit = import_with_limit(
            &target.state,
            ImportBackupInput {
                source_path: backup.to_string_lossy().into_owned(),
            },
            u64::from(file.size_bytes),
        );

        assert!(matches!(too_small_limit, Err(AppError::Validation(_))));
        assert!(exact_limit.is_ok());
    }

    #[test]
    fn only_the_most_recent_safety_copies_are_kept() {
        let source = workspace();
        add_project(&source.state, "Data");
        let folder = tempfile::tempdir().expect("folder");
        let backup = folder.path().join("b.db");
        export_to(&source.state, &backup, false).expect("exports");
        let target = workspace();

        for _ in 0..(SAFETY_BACKUPS_KEPT + 3) {
            import_from(&target.state, &backup).expect("imports");
        }

        assert_eq!(safety_backups(&target).len(), SAFETY_BACKUPS_KEPT);
    }

    #[test]
    fn importing_into_an_in_memory_database_works_without_a_safety_copy() {
        let source = workspace();
        add_project(&source.state, "Imported");
        let folder = tempfile::tempdir().expect("folder");
        let backup = folder.path().join("b.db");
        export_to(&source.state, &backup, false).expect("exports");
        let mut connection = crate::db::connection::open_in_memory().expect("opens");
        migrations::run(&mut connection).expect("migrates");
        let state = AppState::new(connection, None);

        let report = import_from(&state, &backup).expect("imports");

        assert_eq!(report.safety_backup_path, None);
        assert_eq!(project_names(&state), ["Imported"]);
    }

    #[test]
    fn the_imported_vault_path_is_restored_into_the_running_state() {
        let source = workspace();
        let vault = tempfile::tempdir().expect("vault");
        crate::modules::notes::vault_service::setup(
            &source.state,
            crate::modules::notes::vault_service::SetupVaultInput {
                path: vault.path().to_string_lossy().into_owned(),
                create: false,
            },
        )
        .expect("sets up the vault");
        let folder = tempfile::tempdir().expect("folder");
        let backup = folder.path().join("b.db");
        export_to(&source.state, &backup, false).expect("exports");
        let target = workspace();
        assert_eq!(target.state.vault_path(), None);

        import_from(&target.state, &backup).expect("imports");

        assert_eq!(target.state.vault_path().as_deref(), Some(vault.path()));
    }
}
