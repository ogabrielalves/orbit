use rusqlite::{Connection, OptionalExtension, Row};

use super::models::{Project, ProjectBoard, ProjectStatus};
use crate::error::AppResult;

const PROJECT_COLUMNS: &str =
    "id, name, description, icon, color, status, created_at, updated_at, archived_at";

pub struct ListFilter<'a> {
    pub scope: &'a str,
    pub status: Option<&'a str>,
    pub search_pattern: Option<&'a str>,
}

fn map_project(row: &Row<'_>) -> rusqlite::Result<Project> {
    let status_text: String = row.get(5)?;
    let status = ProjectStatus::parse(&status_text).ok_or_else(|| {
        rusqlite::Error::FromSqlConversionFailure(
            5,
            rusqlite::types::Type::Text,
            format!("unknown project status '{status_text}'").into(),
        )
    })?;
    Ok(Project {
        id: row.get(0)?,
        name: row.get(1)?,
        description: row.get(2)?,
        icon: row.get(3)?,
        color: row.get(4)?,
        status,
        created_at: row.get(6)?,
        updated_at: row.get(7)?,
        archived_at: row.get(8)?,
    })
}

pub fn insert(connection: &Connection, project: &Project) -> AppResult<()> {
    connection.execute(
        "INSERT INTO projects (id, name, description, icon, color, status, created_at, updated_at, archived_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        (
            &project.id,
            &project.name,
            &project.description,
            &project.icon,
            &project.color,
            project.status.as_str(),
            &project.created_at,
            &project.updated_at,
            &project.archived_at,
        ),
    )?;
    Ok(())
}

pub fn find_by_id(connection: &Connection, id: &str) -> AppResult<Option<Project>> {
    let sql = format!("SELECT {PROJECT_COLUMNS} FROM projects WHERE id = ?1");
    let project = connection.query_row(&sql, [id], map_project).optional()?;
    Ok(project)
}

pub fn update(connection: &Connection, project: &Project) -> AppResult<usize> {
    let affected = connection.execute(
        "UPDATE projects
         SET name = ?2, description = ?3, icon = ?4, color = ?5, status = ?6, updated_at = ?7
         WHERE id = ?1",
        (
            &project.id,
            &project.name,
            &project.description,
            &project.icon,
            &project.color,
            project.status.as_str(),
            &project.updated_at,
        ),
    )?;
    Ok(affected)
}

pub fn set_archived_at(
    connection: &Connection,
    id: &str,
    archived_at: Option<&str>,
    updated_at: &str,
) -> AppResult<usize> {
    let affected = connection.execute(
        "UPDATE projects SET archived_at = ?2, updated_at = ?3 WHERE id = ?1",
        (id, archived_at, updated_at),
    )?;
    Ok(affected)
}

pub fn delete(connection: &Connection, id: &str) -> AppResult<usize> {
    let affected = connection.execute("DELETE FROM projects WHERE id = ?1", [id])?;
    Ok(affected)
}

pub fn list(connection: &Connection, filter: &ListFilter<'_>) -> AppResult<Vec<Project>> {
    let sql = format!(
        "SELECT {PROJECT_COLUMNS} FROM projects
         WHERE (?1 = 'all'
                OR (?1 = 'active' AND archived_at IS NULL)
                OR (?1 = 'archived' AND archived_at IS NOT NULL))
           AND (?2 IS NULL OR status = ?2)
           AND (?3 IS NULL OR name LIKE ?3 ESCAPE '\\' OR description LIKE ?3 ESCAPE '\\')
         ORDER BY updated_at DESC, id DESC"
    );
    let mut statement = connection.prepare(&sql)?;
    let rows = statement.query_map(
        (filter.scope, filter.status, filter.search_pattern),
        map_project,
    )?;
    let projects = rows.collect::<Result<Vec<_>, _>>()?;
    Ok(projects)
}

pub fn find_boards(connection: &Connection, project_id: &str) -> AppResult<Vec<ProjectBoard>> {
    let mut statement = connection.prepare(
        "SELECT b.id, b.name, b.created_at,
                (SELECT COUNT(*) FROM tasks t
                 WHERE t.board_id = b.id AND t.archived_at IS NULL AND t.parent_task_id IS NULL)
         FROM boards b
         WHERE b.project_id = ?1 AND b.archived_at IS NULL
         ORDER BY b.created_at, b.id",
    )?;
    let rows = statement.query_map([project_id], |row| {
        Ok(ProjectBoard {
            id: row.get(0)?,
            name: row.get(1)?,
            created_at: row.get(2)?,
            task_count: row.get(3)?,
        })
    })?;
    let boards = rows.collect::<Result<Vec<_>, _>>()?;
    Ok(boards)
}

pub fn count_tasks(connection: &Connection, project_id: &str) -> AppResult<u32> {
    let count = connection.query_row(
        "SELECT COUNT(*) FROM tasks
         WHERE project_id = ?1 AND archived_at IS NULL AND parent_task_id IS NULL",
        [project_id],
        |row| row.get(0),
    )?;
    Ok(count)
}

pub fn count_backlog_tasks(connection: &Connection, project_id: &str) -> AppResult<u32> {
    let count = connection.query_row(
        "SELECT COUNT(*) FROM tasks
         WHERE project_id = ?1 AND board_id IS NULL AND archived_at IS NULL AND parent_task_id IS NULL",
        [project_id],
        |row| row.get(0),
    )?;
    Ok(count)
}

pub fn find_attachment_stored_names(
    connection: &Connection,
    project_id: &str,
) -> AppResult<Vec<String>> {
    let mut statement = connection.prepare(
        "SELECT a.stored_name FROM attachments a
         JOIN tasks t ON t.id = a.task_id
         WHERE t.project_id = ?1
         ORDER BY a.stored_name",
    )?;
    let rows = statement.query_map([project_id], |row| row.get(0))?;
    let names = rows.collect::<Result<Vec<String>, _>>()?;
    Ok(names)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{connection::open_in_memory, migrations};

    const NOW: &str = "2026-11-08T10:00:00.000Z";

    fn migrated_connection() -> Connection {
        let mut connection = open_in_memory().expect("opens");
        migrations::run(&mut connection).expect("migrates");
        connection
    }

    fn project(id: &str, name: &str, updated_at: &str) -> Project {
        Project {
            id: id.into(),
            name: name.into(),
            description: String::new(),
            icon: None,
            color: None,
            status: ProjectStatus::Active,
            created_at: NOW.into(),
            updated_at: updated_at.into(),
            archived_at: None,
        }
    }

    fn all_projects() -> ListFilter<'static> {
        ListFilter {
            scope: "all",
            status: None,
            search_pattern: None,
        }
    }

    fn ids(projects: &[Project]) -> Vec<&str> {
        projects.iter().map(|project| project.id.as_str()).collect()
    }

    fn insert_board(connection: &Connection, id: &str, project_id: &str, created_at: &str) {
        connection
            .execute(
                "INSERT INTO boards (id, project_id, name, created_at, updated_at) VALUES (?1, ?2, ?1, ?3, ?3)",
                (id, project_id, created_at),
            )
            .expect("board");
    }

    fn insert_column(connection: &Connection, id: &str, board_id: &str) {
        connection
            .execute(
                "INSERT INTO columns (id, board_id, name, position, created_at, updated_at) VALUES (?1, ?2, 'Todo', 'V', ?3, ?3)",
                (id, board_id, NOW),
            )
            .expect("column");
    }

    fn insert_task(
        connection: &Connection,
        id: &str,
        project_id: &str,
        placement: Option<(&str, &str)>,
    ) {
        let (board_id, column_id) = match placement {
            Some((board, column)) => (Some(board), Some(column)),
            None => (None, None),
        };
        connection
            .execute(
                "INSERT INTO tasks (id, project_id, board_id, column_id, title, position, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, 'Task', 'V', ?5, ?5)",
                (id, project_id, board_id, column_id, NOW),
            )
            .expect("task");
    }

    #[test]
    fn inserts_and_finds_a_project() {
        let connection = migrated_connection();
        let mut original = project("p1", "ORBIT", NOW);
        original.icon = Some("rocket".into());
        original.color = Some("#123456".into());
        original.status = ProjectStatus::Paused;

        insert(&connection, &original).expect("inserts");

        let found = find_by_id(&connection, "p1").expect("reads");
        assert_eq!(found, Some(original));
    }

    #[test]
    fn find_by_id_returns_none_for_unknown_id() {
        let connection = migrated_connection();

        let found = find_by_id(&connection, "missing").expect("reads");

        assert_eq!(found, None);
    }

    #[test]
    fn update_changes_fields_but_not_archive_state_or_creation() {
        let connection = migrated_connection();
        insert(&connection, &project("p1", "Old", NOW)).expect("inserts");
        set_archived_at(&connection, "p1", Some(NOW), NOW).expect("archives");
        let mut changed = project("p1", "New", "2026-11-09T10:00:00.000Z");
        changed.status = ProjectStatus::Completed;
        changed.description = "desc".into();
        changed.created_at = "1999-01-01T00:00:00.000Z".into();

        let affected = update(&connection, &changed).expect("updates");

        let stored = find_by_id(&connection, "p1")
            .expect("reads")
            .expect("exists");
        assert_eq!(affected, 1);
        assert_eq!(stored.name, "New");
        assert_eq!(stored.status, ProjectStatus::Completed);
        assert_eq!(stored.description, "desc");
        assert_eq!(stored.updated_at, "2026-11-09T10:00:00.000Z");
        assert_eq!(stored.created_at, NOW);
        assert_eq!(stored.archived_at.as_deref(), Some(NOW));
    }

    #[test]
    fn update_of_unknown_id_affects_nothing() {
        let connection = migrated_connection();

        let affected = update(&connection, &project("missing", "x", NOW)).expect("updates");

        assert_eq!(affected, 0);
    }

    #[test]
    fn set_archived_at_archives_and_restores() {
        let connection = migrated_connection();
        insert(&connection, &project("p1", "ORBIT", NOW)).expect("inserts");

        set_archived_at(
            &connection,
            "p1",
            Some("2026-11-09T00:00:00.000Z"),
            "2026-11-09T00:00:00.000Z",
        )
        .expect("archives");
        let archived = find_by_id(&connection, "p1")
            .expect("reads")
            .expect("exists");
        set_archived_at(&connection, "p1", None, "2026-11-10T00:00:00.000Z").expect("restores");
        let restored = find_by_id(&connection, "p1")
            .expect("reads")
            .expect("exists");

        assert_eq!(
            archived.archived_at.as_deref(),
            Some("2026-11-09T00:00:00.000Z")
        );
        assert_eq!(restored.archived_at, None);
        assert_eq!(restored.updated_at, "2026-11-10T00:00:00.000Z");
    }

    #[test]
    fn delete_removes_the_project_and_reports_how_many() {
        let connection = migrated_connection();
        insert(&connection, &project("p1", "ORBIT", NOW)).expect("inserts");

        let first = delete(&connection, "p1").expect("deletes");
        let second = delete(&connection, "p1").expect("deletes again");

        assert_eq!(first, 1);
        assert_eq!(second, 0);
        assert_eq!(find_by_id(&connection, "p1").expect("reads"), None);
    }

    #[test]
    fn list_orders_by_most_recently_updated_first() {
        let connection = migrated_connection();
        insert(
            &connection,
            &project("old", "A", "2026-01-01T00:00:00.000Z"),
        )
        .expect("inserts");
        insert(
            &connection,
            &project("new", "B", "2026-03-01T00:00:00.000Z"),
        )
        .expect("inserts");
        insert(
            &connection,
            &project("mid", "C", "2026-02-01T00:00:00.000Z"),
        )
        .expect("inserts");

        let projects = list(&connection, &all_projects()).expect("lists");

        assert_eq!(ids(&projects), ["new", "mid", "old"]);
    }

    #[test]
    fn list_scope_separates_active_from_archived() {
        let connection = migrated_connection();
        insert(&connection, &project("live", "A", NOW)).expect("inserts");
        insert(&connection, &project("gone", "B", NOW)).expect("inserts");
        set_archived_at(&connection, "gone", Some(NOW), NOW).expect("archives");

        let active = ListFilter {
            scope: "active",
            ..all_projects()
        };
        let archived = ListFilter {
            scope: "archived",
            ..all_projects()
        };

        assert_eq!(ids(&list(&connection, &active).expect("lists")), ["live"]);
        assert_eq!(ids(&list(&connection, &archived).expect("lists")), ["gone"]);
        assert_eq!(list(&connection, &all_projects()).expect("lists").len(), 2);
    }

    #[test]
    fn list_filters_by_status() {
        let connection = migrated_connection();
        insert(&connection, &project("a", "A", NOW)).expect("inserts");
        let mut paused = project("b", "B", NOW);
        paused.status = ProjectStatus::Paused;
        insert(&connection, &paused).expect("inserts");

        let filter = ListFilter {
            status: Some("paused"),
            ..all_projects()
        };

        assert_eq!(ids(&list(&connection, &filter).expect("lists")), ["b"]);
    }

    #[test]
    fn list_text_filter_matches_name_or_description_ignoring_case() {
        let connection = migrated_connection();
        insert(&connection, &project("a", "Website Redesign", NOW)).expect("inserts");
        let mut with_description = project("b", "Other", NOW);
        with_description.description = "Plan the REDESIGN of docs".into();
        insert(&connection, &with_description).expect("inserts");
        insert(&connection, &project("c", "Unrelated", NOW)).expect("inserts");

        let filter = ListFilter {
            search_pattern: Some("%redesign%"),
            ..all_projects()
        };

        let found = list(&connection, &filter).expect("lists");
        assert_eq!(found.len(), 2);
        assert!(!ids(&found).contains(&"c"));
    }

    #[test]
    fn list_text_filter_treats_percent_as_a_literal_when_escaped() {
        let connection = migrated_connection();
        insert(&connection, &project("a", "100% done", NOW)).expect("inserts");
        insert(&connection, &project("b", "Anything", NOW)).expect("inserts");

        let filter = ListFilter {
            search_pattern: Some("%100\\%%"),
            ..all_projects()
        };

        assert_eq!(ids(&list(&connection, &filter).expect("lists")), ["a"]);
    }

    #[test]
    fn list_combines_scope_status_and_text_filters() {
        let connection = migrated_connection();
        insert(&connection, &project("match", "Alpha site", NOW)).expect("inserts");
        insert(&connection, &project("wrong-name", "Beta", NOW)).expect("inserts");
        let mut paused = project("wrong-status", "Alpha app", NOW);
        paused.status = ProjectStatus::Paused;
        insert(&connection, &paused).expect("inserts");
        insert(&connection, &project("archived", "Alpha old", NOW)).expect("inserts");
        set_archived_at(&connection, "archived", Some(NOW), NOW).expect("archives");

        let filter = ListFilter {
            scope: "active",
            status: Some("active"),
            search_pattern: Some("%alpha%"),
        };

        assert_eq!(ids(&list(&connection, &filter).expect("lists")), ["match"]);
    }

    #[test]
    fn find_boards_returns_only_active_boards_of_the_project_with_task_counts() {
        let connection = migrated_connection();
        insert(&connection, &project("p1", "A", NOW)).expect("inserts");
        insert(&connection, &project("p2", "B", NOW)).expect("inserts");
        insert_board(&connection, "b-late", "p1", "2026-02-01T00:00:00.000Z");
        insert_board(&connection, "b-early", "p1", "2026-01-01T00:00:00.000Z");
        insert_board(&connection, "b-other", "p2", NOW);
        insert_board(&connection, "b-archived", "p1", NOW);
        connection
            .execute(
                "UPDATE boards SET archived_at = ?1 WHERE id = 'b-archived'",
                [NOW],
            )
            .expect("archives board");
        insert_column(&connection, "c1", "b-early");
        insert_task(&connection, "t1", "p1", Some(("b-early", "c1")));
        insert_task(&connection, "t2", "p1", Some(("b-early", "c1")));

        let boards = find_boards(&connection, "p1").expect("reads");

        let summary: Vec<(&str, u32)> = boards
            .iter()
            .map(|board| (board.id.as_str(), board.task_count))
            .collect();
        assert_eq!(summary, [("b-early", 2), ("b-late", 0)]);
    }

    #[test]
    fn task_counts_ignore_archived_tasks_and_subtasks() {
        let connection = migrated_connection();
        insert(&connection, &project("p1", "A", NOW)).expect("inserts");
        insert(&connection, &project("p2", "B", NOW)).expect("inserts");
        insert_board(&connection, "b1", "p1", NOW);
        insert_column(&connection, "c1", "b1");
        insert_task(&connection, "on-board", "p1", Some(("b1", "c1")));
        insert_task(&connection, "backlog-1", "p1", None);
        insert_task(&connection, "backlog-2", "p1", None);
        insert_task(&connection, "of-other-project", "p2", None);
        connection
            .execute(
                "UPDATE tasks SET archived_at = ?1 WHERE id = 'backlog-2'",
                [NOW],
            )
            .expect("archives task");
        connection
            .execute(
                "INSERT INTO tasks (id, project_id, parent_task_id, title, position, created_at, updated_at) VALUES ('sub', 'p1', 'backlog-1', 'Sub', 'V', ?1, ?1)",
                [NOW],
            )
            .expect("subtask");

        assert_eq!(count_tasks(&connection, "p1").expect("counts"), 2);
        assert_eq!(count_backlog_tasks(&connection, "p1").expect("counts"), 1);
        assert_eq!(count_tasks(&connection, "empty").expect("counts"), 0);
    }

    #[test]
    fn finds_attachment_names_across_all_tasks_of_the_project_only() {
        let connection = migrated_connection();
        insert(&connection, &project("p1", "A", NOW)).expect("inserts");
        insert(&connection, &project("p2", "B", NOW)).expect("inserts");
        insert_task(&connection, "t1", "p1", None);
        insert_task(&connection, "t2", "p1", None);
        insert_task(&connection, "t3", "p2", None);
        for (id, task, stored) in [
            ("a1", "t1", "file-b"),
            ("a2", "t2", "file-a"),
            ("a3", "t3", "file-x"),
        ] {
            connection
                .execute(
                    "INSERT INTO attachments (id, task_id, file_name, stored_name, mime_type, size_bytes, created_at) VALUES (?1, ?2, 'f', ?3, 'text/plain', 1, ?4)",
                    (id, task, stored, NOW),
                )
                .expect("attachment");
        }

        let names = find_attachment_stored_names(&connection, "p1").expect("reads");

        assert_eq!(names, ["file-a", "file-b"]);
    }
}
