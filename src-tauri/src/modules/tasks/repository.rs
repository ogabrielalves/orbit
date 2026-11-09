use rusqlite::{Connection, OptionalExtension, Row};

use super::models::{Task, TaskPriority};
use crate::error::AppResult;
use crate::modules::boards::models::ColumnKind;
use crate::modules::boards::repository::parse_kind;

const TASK_COLUMNS: &str = "id, project_id, board_id, column_id, parent_task_id, title, description, \
     priority, due_date, position, created_at, updated_at, completed_at, archived_at";

pub struct ColumnInfo {
    pub id: String,
    pub name: String,
    pub board_id: String,
    pub board_name: String,
    pub project_id: String,
    pub kind: ColumnKind,
}

pub struct TaskSlot {
    pub id: String,
    pub position: String,
}

fn map_task(row: &Row<'_>) -> rusqlite::Result<Task> {
    let priority_text: String = row.get(7)?;
    let priority = TaskPriority::parse(&priority_text).ok_or_else(|| {
        rusqlite::Error::FromSqlConversionFailure(
            7,
            rusqlite::types::Type::Text,
            format!("unknown task priority '{priority_text}'").into(),
        )
    })?;
    Ok(Task {
        id: row.get(0)?,
        project_id: row.get(1)?,
        board_id: row.get(2)?,
        column_id: row.get(3)?,
        parent_task_id: row.get(4)?,
        title: row.get(5)?,
        description: row.get(6)?,
        priority,
        due_date: row.get(8)?,
        position: row.get(9)?,
        created_at: row.get(10)?,
        updated_at: row.get(11)?,
        completed_at: row.get(12)?,
        archived_at: row.get(13)?,
    })
}

fn map_slot(row: &Row<'_>) -> rusqlite::Result<TaskSlot> {
    Ok(TaskSlot {
        id: row.get(0)?,
        position: row.get(1)?,
    })
}

pub fn project_exists(connection: &Connection, project_id: &str) -> AppResult<bool> {
    let exists = connection.query_row(
        "SELECT EXISTS(SELECT 1 FROM projects WHERE id = ?1)",
        [project_id],
        |row| row.get(0),
    )?;
    Ok(exists)
}

pub fn board_exists(connection: &Connection, board_id: &str) -> AppResult<bool> {
    let exists = connection.query_row(
        "SELECT EXISTS(SELECT 1 FROM boards WHERE id = ?1)",
        [board_id],
        |row| row.get(0),
    )?;
    Ok(exists)
}

pub fn find_column_info(connection: &Connection, column_id: &str) -> AppResult<Option<ColumnInfo>> {
    let info = connection
        .query_row(
            "SELECT c.id, c.name, c.board_id, b.name, b.project_id, c.kind
             FROM columns c JOIN boards b ON b.id = c.board_id
             WHERE c.id = ?1",
            [column_id],
            map_column_info,
        )
        .optional()?;
    Ok(info)
}

pub fn find_first_column_info(
    connection: &Connection,
    board_id: &str,
) -> AppResult<Option<ColumnInfo>> {
    let info = connection
        .query_row(
            "SELECT c.id, c.name, c.board_id, b.name, b.project_id, c.kind
             FROM columns c JOIN boards b ON b.id = c.board_id
             WHERE c.board_id = ?1
             ORDER BY c.position
             LIMIT 1",
            [board_id],
            map_column_info,
        )
        .optional()?;
    Ok(info)
}

fn map_column_info(row: &Row<'_>) -> rusqlite::Result<ColumnInfo> {
    Ok(ColumnInfo {
        id: row.get(0)?,
        name: row.get(1)?,
        board_id: row.get(2)?,
        board_name: row.get(3)?,
        project_id: row.get(4)?,
        kind: parse_kind(5, row.get(5)?)?,
    })
}

pub fn find_board_name(connection: &Connection, board_id: &str) -> AppResult<Option<String>> {
    let name = connection
        .query_row("SELECT name FROM boards WHERE id = ?1", [board_id], |row| {
            row.get(0)
        })
        .optional()?;
    Ok(name)
}

pub fn find_board_project_id(connection: &Connection, board_id: &str) -> AppResult<Option<String>> {
    let project_id = connection
        .query_row(
            "SELECT project_id FROM boards WHERE id = ?1",
            [board_id],
            |row| row.get(0),
        )
        .optional()?;
    Ok(project_id)
}

pub fn insert(connection: &Connection, task: &Task) -> AppResult<()> {
    connection.execute(
        "INSERT INTO tasks (id, project_id, board_id, column_id, parent_task_id, title, description,
                            priority, due_date, position, created_at, updated_at, completed_at, archived_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)",
        (
            &task.id,
            &task.project_id,
            &task.board_id,
            &task.column_id,
            &task.parent_task_id,
            &task.title,
            &task.description,
            task.priority.as_str(),
            &task.due_date,
            &task.position,
            &task.created_at,
            &task.updated_at,
            &task.completed_at,
            &task.archived_at,
        ),
    )?;
    Ok(())
}

pub fn find_by_id(connection: &Connection, id: &str) -> AppResult<Option<Task>> {
    let sql = format!("SELECT {TASK_COLUMNS} FROM tasks WHERE id = ?1");
    let task = connection.query_row(&sql, [id], map_task).optional()?;
    Ok(task)
}

pub fn update_fields(connection: &Connection, task: &Task) -> AppResult<usize> {
    let affected = connection.execute(
        "UPDATE tasks
         SET title = ?2, description = ?3, priority = ?4, due_date = ?5, updated_at = ?6
         WHERE id = ?1",
        (
            &task.id,
            &task.title,
            &task.description,
            task.priority.as_str(),
            &task.due_date,
            &task.updated_at,
        ),
    )?;
    Ok(affected)
}

pub fn set_archived_at(
    connection: &Connection,
    id: &str,
    archived_at: Option<&str>,
    position: &str,
    updated_at: &str,
) -> AppResult<usize> {
    let affected = connection.execute(
        "UPDATE tasks SET archived_at = ?2, position = ?3, updated_at = ?4 WHERE id = ?1",
        (id, archived_at, position, updated_at),
    )?;
    Ok(affected)
}

pub fn set_placement(
    connection: &Connection,
    id: &str,
    board_id: Option<&str>,
    column_id: Option<&str>,
    position: &str,
    completed_at: Option<&str>,
    updated_at: &str,
) -> AppResult<usize> {
    let affected = connection.execute(
        "UPDATE tasks
         SET board_id = ?2, column_id = ?3, position = ?4, completed_at = ?5, updated_at = ?6
         WHERE id = ?1",
        (id, board_id, column_id, position, completed_at, updated_at),
    )?;
    Ok(affected)
}

pub fn delete(connection: &Connection, id: &str) -> AppResult<usize> {
    let affected = connection.execute("DELETE FROM tasks WHERE id = ?1", [id])?;
    Ok(affected)
}

pub fn list_by_board(connection: &Connection, board_id: &str) -> AppResult<Vec<Task>> {
    let sql = format!(
        "SELECT {TASK_COLUMNS} FROM tasks
         WHERE board_id = ?1 AND archived_at IS NULL AND parent_task_id IS NULL
         ORDER BY column_id, position, id"
    );
    let mut statement = connection.prepare(&sql)?;
    let rows = statement.query_map([board_id], map_task)?;
    let tasks = rows.collect::<Result<Vec<_>, _>>()?;
    Ok(tasks)
}

pub fn list_column_slots(connection: &Connection, column_id: &str) -> AppResult<Vec<TaskSlot>> {
    let mut statement = connection.prepare(
        "SELECT id, position FROM tasks
         WHERE column_id = ?1 AND archived_at IS NULL AND parent_task_id IS NULL
         ORDER BY position, id",
    )?;
    let rows = statement.query_map([column_id], map_slot)?;
    let slots = rows.collect::<Result<Vec<_>, _>>()?;
    Ok(slots)
}

pub fn list_backlog_slots(connection: &Connection, project_id: &str) -> AppResult<Vec<TaskSlot>> {
    let mut statement = connection.prepare(
        "SELECT id, position FROM tasks
         WHERE project_id = ?1 AND board_id IS NULL AND parent_task_id IS NULL AND archived_at IS NULL
         ORDER BY position, id",
    )?;
    let rows = statement.query_map([project_id], map_slot)?;
    let slots = rows.collect::<Result<Vec<_>, _>>()?;
    Ok(slots)
}

pub fn find_attachment_stored_names(
    connection: &Connection,
    task_id: &str,
) -> AppResult<Vec<String>> {
    let mut statement = connection.prepare(
        "SELECT stored_name FROM attachments
         WHERE task_id = ?1 OR task_id IN (SELECT id FROM tasks WHERE parent_task_id = ?1)
         ORDER BY stored_name",
    )?;
    let rows = statement.query_map([task_id], |row| row.get(0))?;
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
        for sql in [
            "INSERT INTO projects (id, name, created_at, updated_at) VALUES ('p1', 'Project', '2026-11-08T10:00:00.000Z', '2026-11-08T10:00:00.000Z')",
            "INSERT INTO boards (id, project_id, name, created_at, updated_at) VALUES ('b1', 'p1', 'Sprint', '2026-11-08T10:00:00.000Z', '2026-11-08T10:00:00.000Z')",
            "INSERT INTO columns (id, board_id, name, position, created_at, updated_at) VALUES ('c1', 'b1', 'Todo', 'A', '2026-11-08T10:00:00.000Z', '2026-11-08T10:00:00.000Z')",
            "INSERT INTO columns (id, board_id, name, position, created_at, updated_at) VALUES ('c2', 'b1', 'Done', 'B', '2026-11-08T10:00:00.000Z', '2026-11-08T10:00:00.000Z')",
        ] {
            connection.execute(sql, []).expect("seeds");
        }
        connection
    }

    fn task(id: &str, position: &str) -> Task {
        Task {
            id: id.into(),
            project_id: "p1".into(),
            board_id: None,
            column_id: None,
            parent_task_id: None,
            title: format!("Task {id}"),
            description: String::new(),
            priority: TaskPriority::Medium,
            due_date: None,
            position: position.into(),
            created_at: NOW.into(),
            updated_at: NOW.into(),
            completed_at: None,
            archived_at: None,
        }
    }

    fn on_column(mut task: Task, column: &str) -> Task {
        task.board_id = Some("b1".into());
        task.column_id = Some(column.into());
        task
    }

    fn slot_ids(slots: &[TaskSlot]) -> Vec<&str> {
        slots.iter().map(|slot| slot.id.as_str()).collect()
    }

    #[test]
    fn inserts_and_finds_a_task_with_every_field() {
        let connection = migrated_connection();
        let mut original = on_column(task("t1", "V"), "c1");
        original.description = "details".into();
        original.priority = TaskPriority::Urgent;
        original.due_date = Some("2026-12-01".into());

        insert(&connection, &original).expect("inserts");

        assert_eq!(
            find_by_id(&connection, "t1").expect("reads"),
            Some(original)
        );
        assert_eq!(find_by_id(&connection, "missing").expect("reads"), None);
    }

    #[test]
    fn update_fields_changes_content_but_not_placement_or_archive_state() {
        let connection = migrated_connection();
        insert(&connection, &on_column(task("t1", "V"), "c1")).expect("inserts");
        let mut changed = task("t1", "ignored");
        changed.title = "New title".into();
        changed.description = "New description".into();
        changed.priority = TaskPriority::Low;
        changed.due_date = Some("2026-12-24".into());
        changed.updated_at = "2026-11-09T00:00:00.000Z".into();

        let affected = update_fields(&connection, &changed).expect("updates");

        let stored = find_by_id(&connection, "t1")
            .expect("reads")
            .expect("exists");
        assert_eq!(affected, 1);
        assert_eq!(stored.title, "New title");
        assert_eq!(stored.priority, TaskPriority::Low);
        assert_eq!(stored.due_date.as_deref(), Some("2026-12-24"));
        assert_eq!(stored.position, "V");
        assert_eq!(stored.column_id.as_deref(), Some("c1"));
        assert_eq!(stored.updated_at, "2026-11-09T00:00:00.000Z");
    }

    #[test]
    fn set_archived_at_sets_the_flag_and_repositions() {
        let connection = migrated_connection();
        insert(&connection, &task("t1", "V")).expect("inserts");

        set_archived_at(&connection, "t1", Some(NOW), "k", NOW).expect("archives");
        let archived = find_by_id(&connection, "t1")
            .expect("reads")
            .expect("exists");
        set_archived_at(&connection, "t1", None, "z", NOW).expect("restores");
        let restored = find_by_id(&connection, "t1")
            .expect("reads")
            .expect("exists");

        assert_eq!(archived.archived_at.as_deref(), Some(NOW));
        assert_eq!(archived.position, "k");
        assert_eq!(restored.archived_at, None);
        assert_eq!(restored.position, "z");
    }

    #[test]
    fn set_placement_moves_between_backlog_and_a_column() {
        let connection = migrated_connection();
        insert(&connection, &task("t1", "V")).expect("inserts");

        set_placement(
            &connection,
            "t1",
            Some("b1"),
            Some("c2"),
            "k",
            Some(NOW),
            NOW,
        )
        .expect("sends");
        let on_board = find_by_id(&connection, "t1")
            .expect("reads")
            .expect("exists");
        set_placement(&connection, "t1", None, None, "z", None, NOW).expect("returns");
        let in_backlog = find_by_id(&connection, "t1")
            .expect("reads")
            .expect("exists");

        assert_eq!(on_board.board_id.as_deref(), Some("b1"));
        assert_eq!(on_board.column_id.as_deref(), Some("c2"));
        assert_eq!((in_backlog.board_id, in_backlog.column_id), (None, None));
        assert_eq!(in_backlog.position, "z");
    }

    #[test]
    fn delete_reports_how_many_rows_it_removed() {
        let connection = migrated_connection();
        insert(&connection, &task("t1", "V")).expect("inserts");

        assert_eq!(delete(&connection, "t1").expect("deletes"), 1);
        assert_eq!(delete(&connection, "t1").expect("deletes again"), 0);
    }

    #[test]
    fn list_by_board_returns_visible_top_level_tasks_ordered_by_column_then_position() {
        let connection = migrated_connection();
        insert(&connection, &on_column(task("c2-first", "A"), "c2")).expect("inserts");
        insert(&connection, &on_column(task("c1-late", "z"), "c1")).expect("inserts");
        insert(&connection, &on_column(task("c1-early", "B"), "c1")).expect("inserts");
        insert(&connection, &on_column(task("archived", "C"), "c1")).expect("inserts");
        insert(&connection, &on_column(task("sub", "D"), "c1")).expect("inserts");
        insert(&connection, &task("backlog", "E")).expect("inserts");
        set_archived_at(&connection, "archived", Some(NOW), "C", NOW).expect("archives");
        connection
            .execute(
                "UPDATE tasks SET parent_task_id = 'c1-early' WHERE id = 'sub'",
                [],
            )
            .expect("makes subtask");

        let tasks = list_by_board(&connection, "b1").expect("lists");

        let ids: Vec<&str> = tasks.iter().map(|task| task.id.as_str()).collect();
        assert_eq!(ids, ["c1-early", "c1-late", "c2-first"]);
    }

    #[test]
    fn column_slots_are_visible_siblings_in_position_order() {
        let connection = migrated_connection();
        insert(&connection, &on_column(task("b", "k"), "c1")).expect("inserts");
        insert(&connection, &on_column(task("a", "B"), "c1")).expect("inserts");
        insert(&connection, &on_column(task("archived", "C"), "c1")).expect("inserts");
        insert(&connection, &on_column(task("other-column", "D"), "c2")).expect("inserts");
        set_archived_at(&connection, "archived", Some(NOW), "C", NOW).expect("archives");

        let slots = list_column_slots(&connection, "c1").expect("lists");

        assert_eq!(slot_ids(&slots), ["a", "b"]);
    }

    #[test]
    fn backlog_slots_are_scoped_to_the_project_and_exclude_board_tasks() {
        let connection = migrated_connection();
        connection
            .execute(
                "INSERT INTO projects (id, name, created_at, updated_at) VALUES ('p2', 'Other', ?1, ?1)",
                [NOW],
            )
            .expect("second project");
        insert(&connection, &task("late", "z")).expect("inserts");
        insert(&connection, &task("early", "B")).expect("inserts");
        insert(&connection, &on_column(task("on-board", "C"), "c1")).expect("inserts");
        let mut foreign = task("foreign", "D");
        foreign.project_id = "p2".into();
        insert(&connection, &foreign).expect("inserts");

        let slots = list_backlog_slots(&connection, "p1").expect("lists");

        assert_eq!(slot_ids(&slots), ["early", "late"]);
    }

    #[test]
    fn column_info_includes_board_and_project() {
        let connection = migrated_connection();

        let info = find_column_info(&connection, "c2")
            .expect("reads")
            .expect("exists");
        let first = find_first_column_info(&connection, "b1")
            .expect("reads")
            .expect("exists");

        assert_eq!(
            (
                info.name.as_str(),
                info.board_id.as_str(),
                info.board_name.as_str(),
                info.project_id.as_str()
            ),
            ("Done", "b1", "Sprint", "p1")
        );
        assert_eq!(first.id, "c1");
        assert!(
            find_column_info(&connection, "missing")
                .expect("reads")
                .is_none()
        );
        assert!(
            find_first_column_info(&connection, "missing")
                .expect("reads")
                .is_none()
        );
    }

    #[test]
    fn existence_and_lookup_helpers() {
        let connection = migrated_connection();

        assert!(project_exists(&connection, "p1").expect("reads"));
        assert!(!project_exists(&connection, "x").expect("reads"));
        assert!(board_exists(&connection, "b1").expect("reads"));
        assert!(!board_exists(&connection, "x").expect("reads"));
        assert_eq!(
            find_board_name(&connection, "b1")
                .expect("reads")
                .as_deref(),
            Some("Sprint")
        );
        assert_eq!(
            find_board_project_id(&connection, "b1")
                .expect("reads")
                .as_deref(),
            Some("p1")
        );
        assert_eq!(find_board_name(&connection, "x").expect("reads"), None);
    }

    #[test]
    fn attachment_names_cover_the_task_and_its_subtasks_only() {
        let connection = migrated_connection();
        insert(&connection, &task("parent", "A")).expect("inserts");
        insert(&connection, &task("sub", "B")).expect("inserts");
        insert(&connection, &task("unrelated", "C")).expect("inserts");
        connection
            .execute(
                "UPDATE tasks SET parent_task_id = 'parent' WHERE id = 'sub'",
                [],
            )
            .expect("makes subtask");
        for (id, task_id, stored) in [
            ("a1", "parent", "own"),
            ("a2", "sub", "child"),
            ("a3", "unrelated", "other"),
        ] {
            connection
                .execute(
                    "INSERT INTO attachments (id, task_id, file_name, stored_name, mime_type, size_bytes, created_at) VALUES (?1, ?2, 'f', ?3, 'text/plain', 1, ?4)",
                    (id, task_id, stored, NOW),
                )
                .expect("attachment");
        }

        let names = find_attachment_stored_names(&connection, "parent").expect("reads");

        assert_eq!(names, ["child", "own"]);
    }
}
