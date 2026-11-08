use std::ffi::OsStr;
use std::io::ErrorKind;
use std::path::Path;

use super::models::{
    CreateProjectInput, ListProjectsInput, Project, ProjectDetails, ProjectStatus,
    UpdateProjectInput,
};
use super::repository::{self, ListFilter};
use crate::error::{AppError, AppResult};
use crate::modules::activity::models::{ActivityAction, ChangeSet, EntityType};
use crate::modules::activity::service as activity;
use crate::shared::text::{optional_text, require_text, text_or_empty};
use crate::shared::{id, time};
use crate::state::AppState;

const NAME_MAX_LENGTH: usize = 120;

pub fn create(state: &AppState, input: CreateProjectInput) -> AppResult<Project> {
    let name = require_text("project name", &input.name, NAME_MAX_LENGTH)?;
    let now = time::now();
    let project = Project {
        id: id::new_id(),
        name,
        description: text_or_empty(input.description),
        icon: optional_text(input.icon),
        color: optional_text(input.color),
        status: ProjectStatus::Active,
        created_at: now.clone(),
        updated_at: now,
        archived_at: None,
    };

    let mut connection = state.database();
    let transaction = connection.transaction()?;
    repository::insert(&transaction, &project)?;
    let mut changes = ChangeSet::new();
    changes.track("name", None, Some(project.name.as_str()));
    record(&transaction, &project.id, ActivityAction::Created, changes)?;
    transaction.commit()?;
    Ok(project)
}

pub fn update(state: &AppState, id: &str, input: UpdateProjectInput) -> AppResult<Project> {
    let mut connection = state.database();
    let transaction = connection.transaction()?;
    let current = find_existing(&transaction, id)?;
    let changed = apply_update(&current, input)?;
    let changes = diff(&current, &changed);

    let has_changes = !changes.is_empty();
    if !has_changes {
        return Ok(current);
    }

    let updated = Project {
        updated_at: time::now(),
        ..changed
    };
    repository::update(&transaction, &updated)?;
    record(&transaction, id, ActivityAction::Updated, changes)?;
    transaction.commit()?;
    Ok(updated)
}

pub fn archive(state: &AppState, id: &str) -> AppResult<Project> {
    let mut connection = state.database();
    let transaction = connection.transaction()?;
    let current = find_existing(&transaction, id)?;

    let is_already_archived = current.archived_at.is_some();
    if is_already_archived {
        return Ok(current);
    }

    let now = time::now();
    repository::set_archived_at(&transaction, id, Some(&now), &now)?;
    record(&transaction, id, ActivityAction::Archived, ChangeSet::new())?;
    let archived = find_existing(&transaction, id)?;
    transaction.commit()?;
    Ok(archived)
}

pub fn restore(state: &AppState, id: &str) -> AppResult<Project> {
    let mut connection = state.database();
    let transaction = connection.transaction()?;
    let current = find_existing(&transaction, id)?;

    let is_archived = current.archived_at.is_some();
    if !is_archived {
        return Ok(current);
    }

    repository::set_archived_at(&transaction, id, None, &time::now())?;
    record(&transaction, id, ActivityAction::Restored, ChangeSet::new())?;
    let restored = find_existing(&transaction, id)?;
    transaction.commit()?;
    Ok(restored)
}

pub fn delete(state: &AppState, id: &str) -> AppResult<()> {
    let stored_names = {
        let mut connection = state.database();
        let transaction = connection.transaction()?;
        let current = find_existing(&transaction, id)?;
        let stored_names = repository::find_attachment_stored_names(&transaction, id)?;
        repository::delete(&transaction, id)?;
        let mut changes = ChangeSet::new();
        changes.track("name", Some(current.name.as_str()), None);
        record(&transaction, id, ActivityAction::Deleted, changes)?;
        transaction.commit()?;
        stored_names
    };

    if let Some(directory) = state.attachments_directory() {
        remove_attachment_files(directory, &stored_names);
    }
    Ok(())
}

pub fn list(state: &AppState, input: ListProjectsInput) -> AppResult<Vec<Project>> {
    let search_pattern = optional_text(input.search).map(|term| like_pattern(&term));
    let filter = ListFilter {
        scope: input.scope.as_str(),
        status: input.status.map(ProjectStatus::as_str),
        search_pattern: search_pattern.as_deref(),
    };
    let connection = state.database();
    repository::list(&connection, &filter)
}

pub fn get(state: &AppState, id: &str) -> AppResult<ProjectDetails> {
    let connection = state.database();
    let project = find_existing(&connection, id)?;
    Ok(ProjectDetails {
        boards: repository::find_boards(&connection, id)?,
        task_count: repository::count_tasks(&connection, id)?,
        backlog_task_count: repository::count_backlog_tasks(&connection, id)?,
        project,
    })
}

fn find_existing(connection: &rusqlite::Connection, id: &str) -> AppResult<Project> {
    repository::find_by_id(connection, id)?.ok_or_else(|| AppError::NotFound("project".into()))
}

fn record(
    connection: &rusqlite::Connection,
    project_id: &str,
    action: ActivityAction,
    changes: ChangeSet,
) -> AppResult<()> {
    activity::record(connection, EntityType::Project, project_id, action, changes)
}

fn diff(before: &Project, after: &Project) -> ChangeSet {
    let mut changes = ChangeSet::new();
    changes.track(
        "name",
        Some(before.name.as_str()),
        Some(after.name.as_str()),
    );
    changes.track(
        "description",
        Some(before.description.as_str()),
        Some(after.description.as_str()),
    );
    changes.track("icon", before.icon.as_deref(), after.icon.as_deref());
    changes.track("color", before.color.as_deref(), after.color.as_deref());
    changes.track(
        "status",
        Some(before.status.as_str()),
        Some(after.status.as_str()),
    );
    changes
}

fn apply_update(current: &Project, input: UpdateProjectInput) -> AppResult<Project> {
    let mut project = current.clone();
    if let Some(name) = input.name {
        project.name = require_text("project name", &name, NAME_MAX_LENGTH)?;
    }
    if let Some(description) = input.description {
        project.description = text_or_empty(Some(description));
    }
    if let Some(icon) = input.icon {
        project.icon = optional_text(icon);
    }
    if let Some(color) = input.color {
        project.color = optional_text(color);
    }
    if let Some(status) = input.status {
        project.status = status;
    }
    Ok(project)
}

fn like_pattern(term: &str) -> String {
    let escaped = term
        .replace('\\', "\\\\")
        .replace('%', "\\%")
        .replace('_', "\\_");
    format!("%{escaped}%")
}

fn remove_attachment_files(directory: &Path, stored_names: &[String]) {
    for stored_name in stored_names {
        let is_plain_file_name =
            Path::new(stored_name).file_name() == Some(OsStr::new(stored_name));
        if !is_plain_file_name {
            log::warn!("skipping attachment with unsafe stored name '{stored_name}'");
            continue;
        }
        if let Err(error) = std::fs::remove_file(directory.join(stored_name)) {
            let was_already_gone = error.kind() == ErrorKind::NotFound;
            if !was_already_gone {
                log::warn!("could not remove attachment file '{stored_name}': {error}");
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{connection::open_in_memory, migrations};
    use crate::modules::activity::models::ActivityEntry;
    use crate::modules::projects::models::ProjectScope;
    use std::path::PathBuf;
    use std::time::Duration;

    const NOW: &str = "2026-11-08T10:00:00.000Z";

    fn state() -> AppState {
        let mut connection = open_in_memory().expect("opens");
        migrations::run(&mut connection).expect("migrates");
        AppState::new(connection, None)
    }

    fn state_with_attachments() -> (AppState, tempfile::TempDir) {
        let directory = tempfile::tempdir().expect("temp dir");
        let state = state().with_attachments_directory(directory.path().to_path_buf());
        (state, directory)
    }

    fn input(name: &str) -> CreateProjectInput {
        CreateProjectInput {
            name: name.into(),
            description: None,
            icon: None,
            color: None,
        }
    }

    fn create_named(state: &AppState, name: &str) -> Project {
        create(state, input(name)).expect("creates")
    }

    fn wait_for_clock_tick() {
        std::thread::sleep(Duration::from_millis(3));
    }

    fn execute(state: &AppState, sql: &str, params: &[&str]) {
        state
            .database()
            .execute(sql, rusqlite::params_from_iter(params))
            .expect("executes");
    }

    fn seed_task_with_attachment(state: &AppState, project_id: &str, task_id: &str, stored: &str) {
        execute(
            state,
            "INSERT INTO tasks (id, project_id, title, position, created_at, updated_at) VALUES (?1, ?2, 'T', 'V', ?3, ?3)",
            &[task_id, project_id, NOW],
        );
        execute(
            state,
            "INSERT INTO attachments (id, task_id, file_name, stored_name, mime_type, size_bytes, created_at) VALUES (?1, ?2, 'f', ?3, 'text/plain', 1, ?4)",
            &[&format!("a-{task_id}"), task_id, stored, NOW],
        );
    }

    fn write_file(directory: &Path, name: &str) -> PathBuf {
        let path = directory.join(name);
        std::fs::write(&path, "data").expect("writes file");
        path
    }

    #[test]
    fn create_trims_the_name_and_applies_defaults() {
        let state = state();

        let project = create_named(&state, "  ORBIT  ");

        assert_eq!(project.name, "ORBIT");
        assert_eq!(project.description, "");
        assert_eq!(project.status, ProjectStatus::Active);
        assert_eq!(project.archived_at, None);
        assert_eq!(project.created_at, project.updated_at);
        assert_eq!(project.id.len(), 36);
    }

    #[test]
    fn create_persists_the_project() {
        let state = state();

        let created = create_named(&state, "ORBIT");

        let stored = get(&state, &created.id).expect("reads").project;
        assert_eq!(stored, created);
    }

    #[test]
    fn create_keeps_icon_and_color_and_drops_blank_ones() {
        let state = state();
        let with_values = CreateProjectInput {
            icon: Some(" rocket ".into()),
            color: Some("#123456".into()),
            description: Some("  about  ".into()),
            ..input("A")
        };
        let with_blanks = CreateProjectInput {
            icon: Some("   ".into()),
            color: Some(String::new()),
            ..input("B")
        };

        let first = create(&state, with_values).expect("creates");
        let second = create(&state, with_blanks).expect("creates");

        assert_eq!(first.icon.as_deref(), Some("rocket"));
        assert_eq!(first.color.as_deref(), Some("#123456"));
        assert_eq!(first.description, "about");
        assert_eq!((second.icon, second.color), (None, None));
    }

    #[test]
    fn create_rejects_blank_and_overlong_names() {
        let state = state();
        let too_long = "x".repeat(NAME_MAX_LENGTH + 1);

        assert!(matches!(
            create(&state, input("   ")),
            Err(AppError::Validation(_))
        ));
        assert!(matches!(
            create(&state, input(&too_long)),
            Err(AppError::Validation(_))
        ));
        assert!(create(&state, input(&"x".repeat(NAME_MAX_LENGTH))).is_ok());
    }

    #[test]
    fn update_changes_given_fields_and_bumps_updated_at() {
        let state = state();
        let created = create_named(&state, "Old");
        wait_for_clock_tick();
        let patch = UpdateProjectInput {
            name: Some(" New ".into()),
            description: Some("desc".into()),
            status: Some(ProjectStatus::Paused),
            ..Default::default()
        };

        let updated = update(&state, &created.id, patch).expect("updates");

        assert_eq!(updated.name, "New");
        assert_eq!(updated.description, "desc");
        assert_eq!(updated.status, ProjectStatus::Paused);
        assert!(updated.updated_at > created.updated_at);
        assert_eq!(updated.created_at, created.created_at);
        assert_eq!(get(&state, &created.id).expect("reads").project, updated);
    }

    #[test]
    fn update_without_changes_keeps_updated_at() {
        let state = state();
        let created = create_named(&state, "Same");
        wait_for_clock_tick();
        let patch = UpdateProjectInput {
            name: Some("Same".into()),
            ..Default::default()
        };

        let updated = update(&state, &created.id, patch).expect("updates");

        assert_eq!(updated, created);
    }

    #[test]
    fn update_can_set_and_clear_icon_and_color() {
        let state = state();
        let created = create_named(&state, "A");
        let set = UpdateProjectInput {
            icon: Some(Some("rocket".into())),
            color: Some(Some("#fff".into())),
            ..Default::default()
        };
        let with_values = update(&state, &created.id, set).expect("sets");
        let clear = UpdateProjectInput {
            icon: Some(None),
            ..Default::default()
        };

        let after_clear = update(&state, &created.id, clear).expect("clears");

        assert_eq!(with_values.icon.as_deref(), Some("rocket"));
        assert_eq!(after_clear.icon, None);
        assert_eq!(after_clear.color.as_deref(), Some("#fff"));
    }

    #[test]
    fn update_rejects_blank_name_and_leaves_the_project_untouched() {
        let state = state();
        let created = create_named(&state, "Keep");
        let patch = UpdateProjectInput {
            name: Some("  ".into()),
            status: Some(ProjectStatus::Completed),
            ..Default::default()
        };

        let result = update(&state, &created.id, patch);

        assert!(matches!(result, Err(AppError::Validation(_))));
        assert_eq!(get(&state, &created.id).expect("reads").project, created);
    }

    #[test]
    fn update_of_unknown_project_is_not_found() {
        let state = state();

        let result = update(&state, "missing", UpdateProjectInput::default());

        assert!(matches!(result, Err(AppError::NotFound(_))));
    }

    #[test]
    fn archive_sets_archived_at_and_is_idempotent() {
        let state = state();
        let created = create_named(&state, "A");

        let archived = archive(&state, &created.id).expect("archives");
        wait_for_clock_tick();
        let archived_again = archive(&state, &created.id).expect("archives again");

        assert!(archived.archived_at.is_some());
        assert_eq!(archived_again, archived);
    }

    #[test]
    fn restore_clears_archived_at_and_keeps_the_status() {
        let state = state();
        let created = create_named(&state, "A");
        let patch = UpdateProjectInput {
            status: Some(ProjectStatus::Paused),
            ..Default::default()
        };
        update(&state, &created.id, patch).expect("updates");
        archive(&state, &created.id).expect("archives");

        let restored = restore(&state, &created.id).expect("restores");

        assert_eq!(restored.archived_at, None);
        assert_eq!(restored.status, ProjectStatus::Paused);
    }

    #[test]
    fn restore_of_a_project_that_is_not_archived_changes_nothing() {
        let state = state();
        let created = create_named(&state, "A");

        let restored = restore(&state, &created.id).expect("restores");

        assert_eq!(restored, created);
    }

    #[test]
    fn archive_and_restore_of_unknown_project_are_not_found() {
        let state = state();

        assert!(matches!(
            archive(&state, "missing"),
            Err(AppError::NotFound(_))
        ));
        assert!(matches!(
            restore(&state, "missing"),
            Err(AppError::NotFound(_))
        ));
    }

    #[test]
    fn list_hides_archived_projects_by_default() {
        let state = state();
        let live = create_named(&state, "Live");
        let gone = create_named(&state, "Gone");
        archive(&state, &gone.id).expect("archives");

        let projects = list(&state, ListProjectsInput::default()).expect("lists");

        assert_eq!(projects, [live]);
    }

    #[test]
    fn list_scope_archived_and_all() {
        let state = state();
        create_named(&state, "Live");
        let gone = create_named(&state, "Gone");
        archive(&state, &gone.id).expect("archives");

        let archived = list(
            &state,
            ListProjectsInput {
                scope: ProjectScope::Archived,
                ..Default::default()
            },
        )
        .expect("lists");
        let all = list(
            &state,
            ListProjectsInput {
                scope: ProjectScope::All,
                ..Default::default()
            },
        )
        .expect("lists");

        assert_eq!(archived.len(), 1);
        assert_eq!(archived[0].id, gone.id);
        assert_eq!(all.len(), 2);
    }

    #[test]
    fn list_filters_by_status_and_text() {
        let state = state();
        create_named(&state, "Website");
        let paused = create_named(&state, "Website v2");
        let patch = UpdateProjectInput {
            status: Some(ProjectStatus::Paused),
            ..Default::default()
        };
        update(&state, &paused.id, patch).expect("updates");
        create_named(&state, "Mobile");

        let by_status = list(
            &state,
            ListProjectsInput {
                status: Some(ProjectStatus::Paused),
                ..Default::default()
            },
        )
        .expect("lists");
        let by_text = list(
            &state,
            ListProjectsInput {
                search: Some("  WEB ".into()),
                ..Default::default()
            },
        )
        .expect("lists");

        assert_eq!(by_status.len(), 1);
        assert_eq!(by_status[0].id, paused.id);
        assert_eq!(by_text.len(), 2);
    }

    #[test]
    fn list_search_treats_wildcards_literally_and_ignores_blank_terms() {
        let state = state();
        create_named(&state, "100% done");
        create_named(&state, "snake_case");
        create_named(&state, "snakeXcase");

        let percent = list(
            &state,
            ListProjectsInput {
                search: Some("100%".into()),
                ..Default::default()
            },
        )
        .expect("lists");
        let underscore = list(
            &state,
            ListProjectsInput {
                search: Some("snake_case".into()),
                ..Default::default()
            },
        )
        .expect("lists");
        let blank = list(
            &state,
            ListProjectsInput {
                search: Some("   ".into()),
                ..Default::default()
            },
        )
        .expect("lists");

        assert_eq!(percent.len(), 1);
        assert_eq!(underscore.len(), 1);
        assert_eq!(underscore[0].name, "snake_case");
        assert_eq!(blank.len(), 3);
    }

    #[test]
    fn get_returns_boards_and_task_counts() {
        let state = state();
        let project = create_named(&state, "A");
        execute(
            &state,
            "INSERT INTO boards (id, project_id, name, created_at, updated_at) VALUES ('b1', ?1, 'Main', ?2, ?2)",
            &[&project.id, NOW],
        );
        execute(
            &state,
            "INSERT INTO columns (id, board_id, name, position, created_at, updated_at) VALUES ('c1', 'b1', 'Todo', 'V', ?1, ?1)",
            &[NOW],
        );
        execute(
            &state,
            "INSERT INTO tasks (id, project_id, board_id, column_id, title, position, created_at, updated_at) VALUES ('t1', ?1, 'b1', 'c1', 'T', 'V', ?2, ?2)",
            &[&project.id, NOW],
        );
        execute(
            &state,
            "INSERT INTO tasks (id, project_id, title, position, created_at, updated_at) VALUES ('t2', ?1, 'T', 'V', ?2, ?2)",
            &[&project.id, NOW],
        );

        let details = get(&state, &project.id).expect("reads");

        assert_eq!(details.project, project);
        assert_eq!(details.task_count, 2);
        assert_eq!(details.backlog_task_count, 1);
        assert_eq!(details.boards.len(), 1);
        assert_eq!(details.boards[0].name, "Main");
        assert_eq!(details.boards[0].task_count, 1);
    }

    #[test]
    fn get_of_a_new_project_has_no_boards_and_zero_counts() {
        let state = state();
        let project = create_named(&state, "A");

        let details = get(&state, &project.id).expect("reads");

        assert!(details.boards.is_empty());
        assert_eq!((details.task_count, details.backlog_task_count), (0, 0));
    }

    #[test]
    fn get_of_unknown_project_is_not_found() {
        let state = state();

        assert!(matches!(get(&state, "missing"), Err(AppError::NotFound(_))));
    }

    #[test]
    fn delete_removes_the_project_with_its_boards_and_tasks() {
        let state = state();
        let project = create_named(&state, "A");
        let other = create_named(&state, "Other");
        execute(
            &state,
            "INSERT INTO boards (id, project_id, name, created_at, updated_at) VALUES ('b1', ?1, 'Main', ?2, ?2)",
            &[&project.id, NOW],
        );
        execute(
            &state,
            "INSERT INTO tasks (id, project_id, title, position, created_at, updated_at) VALUES ('t1', ?1, 'T', 'V', ?2, ?2)",
            &[&project.id, NOW],
        );

        delete(&state, &project.id).expect("deletes");

        let remaining: i64 = state
            .database()
            .query_row(
                "SELECT (SELECT COUNT(*) FROM boards) + (SELECT COUNT(*) FROM tasks)",
                [],
                |row| row.get(0),
            )
            .expect("counts");
        assert_eq!(remaining, 0);
        assert!(matches!(
            get(&state, &project.id),
            Err(AppError::NotFound(_))
        ));
        assert!(get(&state, &other.id).is_ok());
    }

    #[test]
    fn delete_of_unknown_project_is_not_found() {
        let state = state();

        assert!(matches!(
            delete(&state, "missing"),
            Err(AppError::NotFound(_))
        ));
    }

    #[test]
    fn delete_removes_attachment_files_of_the_project_only() {
        let (state, directory) = state_with_attachments();
        let doomed = create_named(&state, "Doomed");
        let kept = create_named(&state, "Kept");
        seed_task_with_attachment(&state, &doomed.id, "t1", "doomed-1");
        seed_task_with_attachment(&state, &doomed.id, "t2", "doomed-2");
        seed_task_with_attachment(&state, &kept.id, "t3", "kept-1");
        let doomed_files = [
            write_file(directory.path(), "doomed-1"),
            write_file(directory.path(), "doomed-2"),
        ];
        let kept_file = write_file(directory.path(), "kept-1");

        delete(&state, &doomed.id).expect("deletes");

        assert!(doomed_files.iter().all(|path| !path.exists()));
        assert!(kept_file.exists());
    }

    #[test]
    fn delete_succeeds_when_an_attachment_file_is_already_gone() {
        let (state, _directory) = state_with_attachments();
        let project = create_named(&state, "A");
        seed_task_with_attachment(&state, &project.id, "t1", "never-written");

        let result = delete(&state, &project.id);

        assert!(result.is_ok());
        assert!(matches!(
            get(&state, &project.id),
            Err(AppError::NotFound(_))
        ));
    }

    #[test]
    fn delete_never_touches_files_outside_the_attachments_directory() {
        let (state, directory) = state_with_attachments();
        let outside = tempfile::tempdir().expect("outside dir");
        let outside_file = write_file(outside.path(), "precious");
        let project = create_named(&state, "A");
        let outside_name = outside.path().file_name().expect("has a name");
        let escaping_name = format!("../{}/precious", outside_name.to_string_lossy());
        seed_task_with_attachment(&state, &project.id, "t1", &escaping_name);
        let inside_file = write_file(directory.path(), "precious");

        delete(&state, &project.id).expect("deletes");

        assert!(outside_file.exists());
        assert!(inside_file.exists());
    }

    #[test]
    fn delete_works_without_an_attachments_directory() {
        let state = state();
        let project = create_named(&state, "A");
        seed_task_with_attachment(&state, &project.id, "t1", "file");

        let result = delete(&state, &project.id);

        assert!(result.is_ok());
    }

    fn entries_for(state: &AppState, project_id: &str) -> Vec<ActivityEntry> {
        activity::recent(state, Some(100))
            .expect("reads activity")
            .into_iter()
            .filter(|entry| entry.entity_id == project_id)
            .collect()
    }

    fn actions_for(state: &AppState, project_id: &str) -> Vec<ActivityAction> {
        let mut entries = entries_for(state, project_id);
        entries.reverse();
        entries.iter().map(|entry| entry.action).collect()
    }

    #[test]
    fn create_logs_a_created_entry_carrying_the_name() {
        let state = state();

        let project = create_named(&state, "ORBIT");

        let entries = entries_for(&state, &project.id);
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].entity_type, EntityType::Project);
        assert_eq!(entries[0].action, ActivityAction::Created);
        let changes = entries[0].changes.as_ref().expect("has changes");
        assert_eq!(changes["name"].from, None);
        assert_eq!(changes["name"].to.as_deref(), Some("ORBIT"));
    }

    #[test]
    fn update_logs_only_the_fields_that_changed() {
        let state = state();
        let project = create_named(&state, "Old");
        let patch = UpdateProjectInput {
            name: Some("New".into()),
            status: Some(ProjectStatus::Paused),
            description: Some(String::new()),
            ..Default::default()
        };

        update(&state, &project.id, patch).expect("updates");

        let entries = entries_for(&state, &project.id);
        assert_eq!(entries[0].action, ActivityAction::Updated);
        let changes = entries[0].changes.as_ref().expect("has changes");
        let mut fields: Vec<&str> = changes.keys().map(String::as_str).collect();
        fields.sort_unstable();
        assert_eq!(fields, ["name", "status"]);
        assert_eq!(changes["name"].from.as_deref(), Some("Old"));
        assert_eq!(changes["name"].to.as_deref(), Some("New"));
        assert_eq!(changes["status"].from.as_deref(), Some("active"));
        assert_eq!(changes["status"].to.as_deref(), Some("paused"));
    }

    #[test]
    fn update_logs_set_and_cleared_optional_fields() {
        let state = state();
        let project = create_named(&state, "A");
        let set = UpdateProjectInput {
            icon: Some(Some("rocket".into())),
            ..Default::default()
        };
        update(&state, &project.id, set).expect("sets");
        let clear = UpdateProjectInput {
            icon: Some(None),
            ..Default::default()
        };
        update(&state, &project.id, clear).expect("clears");

        let entries = entries_for(&state, &project.id);
        let cleared = entries[0].changes.as_ref().expect("has changes");
        let set_entry = entries[1].changes.as_ref().expect("has changes");
        assert_eq!(set_entry["icon"].from, None);
        assert_eq!(set_entry["icon"].to.as_deref(), Some("rocket"));
        assert_eq!(cleared["icon"].from.as_deref(), Some("rocket"));
        assert_eq!(cleared["icon"].to, None);
    }

    #[test]
    fn update_without_real_changes_logs_nothing() {
        let state = state();
        let project = create_named(&state, "Same");
        let patch = UpdateProjectInput {
            name: Some("Same".into()),
            status: Some(ProjectStatus::Active),
            ..Default::default()
        };

        update(&state, &project.id, patch).expect("updates");

        assert_eq!(actions_for(&state, &project.id), [ActivityAction::Created]);
    }

    #[test]
    fn rejected_update_logs_nothing() {
        let state = state();
        let project = create_named(&state, "Keep");
        let patch = UpdateProjectInput {
            name: Some("   ".into()),
            ..Default::default()
        };

        let result = update(&state, &project.id, patch);

        assert!(result.is_err());
        assert_eq!(actions_for(&state, &project.id), [ActivityAction::Created]);
    }

    #[test]
    fn archive_and_restore_are_logged_once_each() {
        let state = state();
        let project = create_named(&state, "A");

        archive(&state, &project.id).expect("archives");
        archive(&state, &project.id).expect("archives again");
        restore(&state, &project.id).expect("restores");
        restore(&state, &project.id).expect("restores again");

        assert_eq!(
            actions_for(&state, &project.id),
            [
                ActivityAction::Created,
                ActivityAction::Archived,
                ActivityAction::Restored
            ]
        );
    }

    #[test]
    fn delete_logs_the_name_and_the_entry_outlives_the_project() {
        let state = state();
        let project = create_named(&state, "Doomed");

        delete(&state, &project.id).expect("deletes");

        let entries = entries_for(&state, &project.id);
        assert_eq!(entries[0].action, ActivityAction::Deleted);
        let changes = entries[0].changes.as_ref().expect("has changes");
        assert_eq!(changes["name"].from.as_deref(), Some("Doomed"));
        assert_eq!(changes["name"].to, None);
        assert_eq!(entries.len(), 2);
    }

    #[test]
    fn operations_on_unknown_projects_log_nothing() {
        let state = state();

        let _ = update(&state, "missing", UpdateProjectInput::default());
        let _ = archive(&state, "missing");
        let _ = restore(&state, "missing");
        let _ = delete(&state, "missing");

        assert!(activity::recent(&state, None).expect("reads").is_empty());
    }

    #[test]
    fn a_failing_activity_write_rolls_the_project_write_back() {
        let state = state();
        state
            .database()
            .execute_batch("DROP TABLE activity_log;")
            .expect("drops log table");

        let result = create(&state, input("Ghost"));

        assert!(result.is_err());
        let projects = list(
            &state,
            ListProjectsInput {
                scope: ProjectScope::All,
                ..Default::default()
            },
        )
        .expect("lists");
        assert!(projects.is_empty());
    }

    #[test]
    fn a_failing_activity_write_keeps_the_project_deletion_from_happening() {
        let state = state();
        let project = create_named(&state, "Survivor");
        state
            .database()
            .execute_batch("DROP TABLE activity_log;")
            .expect("drops log table");

        let result = delete(&state, &project.id);

        assert!(result.is_err());
        assert!(get(&state, &project.id).is_ok());
    }

    #[test]
    fn like_pattern_escapes_wildcards_and_backslashes() {
        assert_eq!(like_pattern("a%b_c\\d"), "%a\\%b\\_c\\\\d%");
    }
}
