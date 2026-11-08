use rusqlite::{Connection, OptionalExtension, Row};

use super::models::{Board, BoardColumn};
use crate::error::AppResult;

const BOARD_COLUMNS: &str = "id, project_id, name, created_at, updated_at";

const COLUMN_SELECT: &str =
    "SELECT c.id, c.board_id, c.name, c.position, c.color, c.created_at, c.updated_at,
        (SELECT COUNT(*) FROM tasks t
         WHERE t.column_id = c.id AND t.archived_at IS NULL AND t.parent_task_id IS NULL)
     FROM columns c";

pub struct ColumnSlot {
    pub id: String,
    pub position: String,
}

fn map_board(row: &Row<'_>) -> rusqlite::Result<Board> {
    Ok(Board {
        id: row.get(0)?,
        project_id: row.get(1)?,
        name: row.get(2)?,
        created_at: row.get(3)?,
        updated_at: row.get(4)?,
    })
}

fn map_column(row: &Row<'_>) -> rusqlite::Result<BoardColumn> {
    Ok(BoardColumn {
        id: row.get(0)?,
        board_id: row.get(1)?,
        name: row.get(2)?,
        position: row.get(3)?,
        color: row.get(4)?,
        created_at: row.get(5)?,
        updated_at: row.get(6)?,
        task_count: row.get(7)?,
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

pub fn insert_board(connection: &Connection, board: &Board) -> AppResult<()> {
    connection.execute(
        "INSERT INTO boards (id, project_id, name, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5)",
        (
            &board.id,
            &board.project_id,
            &board.name,
            &board.created_at,
            &board.updated_at,
        ),
    )?;
    Ok(())
}

pub fn find_board(connection: &Connection, id: &str) -> AppResult<Option<Board>> {
    let sql = format!("SELECT {BOARD_COLUMNS} FROM boards WHERE id = ?1");
    let board = connection.query_row(&sql, [id], map_board).optional()?;
    Ok(board)
}

pub fn update_board(connection: &Connection, board: &Board) -> AppResult<usize> {
    let affected = connection.execute(
        "UPDATE boards SET name = ?2, updated_at = ?3 WHERE id = ?1",
        (&board.id, &board.name, &board.updated_at),
    )?;
    Ok(affected)
}

pub fn delete_board(connection: &Connection, id: &str) -> AppResult<usize> {
    let affected = connection.execute("DELETE FROM boards WHERE id = ?1", [id])?;
    Ok(affected)
}

pub fn find_task_ids_on_board(connection: &Connection, board_id: &str) -> AppResult<Vec<String>> {
    let mut statement =
        connection.prepare("SELECT id FROM tasks WHERE board_id = ?1 ORDER BY id")?;
    let rows = statement.query_map([board_id], |row| row.get(0))?;
    let ids = rows.collect::<Result<Vec<String>, _>>()?;
    Ok(ids)
}

pub fn detach_tasks_from_board(
    connection: &Connection,
    board_id: &str,
    updated_at: &str,
) -> AppResult<usize> {
    let affected = connection.execute(
        "UPDATE tasks SET board_id = NULL, column_id = NULL, updated_at = ?2 WHERE board_id = ?1",
        (board_id, updated_at),
    )?;
    Ok(affected)
}

pub fn insert_column(connection: &Connection, column: &BoardColumn) -> AppResult<()> {
    connection.execute(
        "INSERT INTO columns (id, board_id, name, position, color, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        (
            &column.id,
            &column.board_id,
            &column.name,
            &column.position,
            &column.color,
            &column.created_at,
            &column.updated_at,
        ),
    )?;
    Ok(())
}

pub fn find_column(connection: &Connection, id: &str) -> AppResult<Option<BoardColumn>> {
    let sql = format!("{COLUMN_SELECT} WHERE c.id = ?1");
    let column = connection.query_row(&sql, [id], map_column).optional()?;
    Ok(column)
}

pub fn list_columns(connection: &Connection, board_id: &str) -> AppResult<Vec<BoardColumn>> {
    let sql = format!("{COLUMN_SELECT} WHERE c.board_id = ?1 ORDER BY c.position");
    let mut statement = connection.prepare(&sql)?;
    let rows = statement.query_map([board_id], map_column)?;
    let columns = rows.collect::<Result<Vec<_>, _>>()?;
    Ok(columns)
}

pub fn list_column_slots(connection: &Connection, board_id: &str) -> AppResult<Vec<ColumnSlot>> {
    let mut statement = connection
        .prepare("SELECT id, position FROM columns WHERE board_id = ?1 ORDER BY position")?;
    let rows = statement.query_map([board_id], |row| {
        Ok(ColumnSlot {
            id: row.get(0)?,
            position: row.get(1)?,
        })
    })?;
    let slots = rows.collect::<Result<Vec<_>, _>>()?;
    Ok(slots)
}

pub fn update_column(connection: &Connection, column: &BoardColumn) -> AppResult<usize> {
    let affected = connection.execute(
        "UPDATE columns SET name = ?2, color = ?3, position = ?4, updated_at = ?5 WHERE id = ?1",
        (
            &column.id,
            &column.name,
            &column.color,
            &column.position,
            &column.updated_at,
        ),
    )?;
    Ok(affected)
}

pub fn count_tasks_referencing_column(connection: &Connection, column_id: &str) -> AppResult<u32> {
    let count = connection.query_row(
        "SELECT COUNT(*) FROM tasks WHERE column_id = ?1",
        [column_id],
        |row| row.get(0),
    )?;
    Ok(count)
}

pub fn delete_column(connection: &Connection, id: &str) -> AppResult<usize> {
    let affected = connection.execute("DELETE FROM columns WHERE id = ?1", [id])?;
    Ok(affected)
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
            .execute(
                "INSERT INTO projects (id, name, created_at, updated_at) VALUES ('p1', 'P', ?1, ?1)",
                [NOW],
            )
            .expect("project");
        connection
    }

    fn board(id: &str) -> Board {
        Board {
            id: id.into(),
            project_id: "p1".into(),
            name: "Board".into(),
            created_at: NOW.into(),
            updated_at: NOW.into(),
        }
    }

    fn column(id: &str, board_id: &str, position: &str) -> BoardColumn {
        BoardColumn {
            id: id.into(),
            board_id: board_id.into(),
            name: format!("Column {id}"),
            position: position.into(),
            color: None,
            created_at: NOW.into(),
            updated_at: NOW.into(),
            task_count: 0,
        }
    }

    fn insert_task(connection: &Connection, id: &str, board_id: &str, column_id: &str) {
        connection
            .execute(
                "INSERT INTO tasks (id, project_id, board_id, column_id, title, position, created_at, updated_at)
                 VALUES (?1, 'p1', ?2, ?3, 'T', 'V', ?4, ?4)",
                (id, board_id, column_id, NOW),
            )
            .expect("task");
    }

    #[test]
    fn project_exists_reports_presence() {
        let connection = migrated_connection();

        assert!(project_exists(&connection, "p1").expect("reads"));
        assert!(!project_exists(&connection, "missing").expect("reads"));
    }

    #[test]
    fn inserts_finds_updates_and_deletes_a_board() {
        let connection = migrated_connection();
        insert_board(&connection, &board("b1")).expect("inserts");

        let found = find_board(&connection, "b1").expect("reads");
        let mut renamed = board("b1");
        renamed.name = "Renamed".into();
        renamed.updated_at = "2026-11-09T00:00:00.000Z".into();
        let updated = update_board(&connection, &renamed).expect("updates");
        let after_update = find_board(&connection, "b1").expect("reads");
        let deleted = delete_board(&connection, "b1").expect("deletes");

        assert_eq!(found, Some(board("b1")));
        assert_eq!(updated, 1);
        assert_eq!(after_update, Some(renamed));
        assert_eq!(deleted, 1);
        assert_eq!(find_board(&connection, "b1").expect("reads"), None);
    }

    #[test]
    fn find_board_returns_none_for_unknown_id() {
        let connection = migrated_connection();

        assert_eq!(find_board(&connection, "missing").expect("reads"), None);
    }

    #[test]
    fn deleting_a_board_deletes_its_columns() {
        let connection = migrated_connection();
        insert_board(&connection, &board("b1")).expect("board");
        insert_column(&connection, &column("c1", "b1", "V")).expect("column");

        delete_board(&connection, "b1").expect("deletes");

        assert_eq!(find_column(&connection, "c1").expect("reads"), None);
    }

    #[test]
    fn inserts_and_finds_a_column_with_color() {
        let connection = migrated_connection();
        insert_board(&connection, &board("b1")).expect("board");
        let mut original = column("c1", "b1", "V");
        original.color = Some("#ff0000".into());

        insert_column(&connection, &original).expect("inserts");

        assert_eq!(
            find_column(&connection, "c1").expect("reads"),
            Some(original)
        );
    }

    #[test]
    fn list_columns_is_ordered_by_position_and_scoped_to_the_board() {
        let connection = migrated_connection();
        insert_board(&connection, &board("b1")).expect("board");
        insert_board(&connection, &board("b2")).expect("board");
        insert_column(&connection, &column("late", "b1", "z")).expect("column");
        insert_column(&connection, &column("early", "b1", "A")).expect("column");
        insert_column(&connection, &column("mid", "b1", "V")).expect("column");
        insert_column(&connection, &column("other", "b2", "V")).expect("column");

        let columns = list_columns(&connection, "b1").expect("lists");

        let ids: Vec<&str> = columns.iter().map(|column| column.id.as_str()).collect();
        assert_eq!(ids, ["early", "mid", "late"]);
    }

    #[test]
    fn column_task_count_ignores_archived_tasks_and_subtasks() {
        let connection = migrated_connection();
        insert_board(&connection, &board("b1")).expect("board");
        insert_column(&connection, &column("c1", "b1", "V")).expect("column");
        insert_task(&connection, "t1", "b1", "c1");
        insert_task(&connection, "t2", "b1", "c1");
        insert_task(&connection, "archived", "b1", "c1");
        connection
            .execute(
                "UPDATE tasks SET archived_at = ?1 WHERE id = 'archived'",
                [NOW],
            )
            .expect("archives");
        connection
            .execute("UPDATE tasks SET parent_task_id = 't1' WHERE id = 't2'", [])
            .expect("makes subtask");

        let found = find_column(&connection, "c1")
            .expect("reads")
            .expect("exists");
        let listed = list_columns(&connection, "b1").expect("lists");

        assert_eq!(found.task_count, 1);
        assert_eq!(listed[0].task_count, 1);
    }

    #[test]
    fn referencing_count_includes_archived_tasks_and_subtasks() {
        let connection = migrated_connection();
        insert_board(&connection, &board("b1")).expect("board");
        insert_column(&connection, &column("c1", "b1", "V")).expect("column");
        insert_task(&connection, "t1", "b1", "c1");
        insert_task(&connection, "t2", "b1", "c1");
        connection
            .execute("UPDATE tasks SET archived_at = ?1 WHERE id = 't1'", [NOW])
            .expect("archives");
        connection
            .execute("UPDATE tasks SET parent_task_id = 't1' WHERE id = 't2'", [])
            .expect("makes subtask");

        let count = count_tasks_referencing_column(&connection, "c1").expect("counts");

        assert_eq!(count, 2);
    }

    #[test]
    fn list_column_slots_returns_id_and_position_in_order() {
        let connection = migrated_connection();
        insert_board(&connection, &board("b1")).expect("board");
        insert_column(&connection, &column("b", "b1", "z")).expect("column");
        insert_column(&connection, &column("a", "b1", "A")).expect("column");

        let slots = list_column_slots(&connection, "b1").expect("lists");

        let summary: Vec<(&str, &str)> = slots
            .iter()
            .map(|slot| (slot.id.as_str(), slot.position.as_str()))
            .collect();
        assert_eq!(summary, [("a", "A"), ("b", "z")]);
    }

    #[test]
    fn update_column_changes_name_color_and_position() {
        let connection = migrated_connection();
        insert_board(&connection, &board("b1")).expect("board");
        insert_column(&connection, &column("c1", "b1", "V")).expect("column");
        let mut changed = column("c1", "b1", "k");
        changed.name = "Renamed".into();
        changed.color = Some("#00ff00".into());
        changed.updated_at = "2026-11-09T00:00:00.000Z".into();

        let affected = update_column(&connection, &changed).expect("updates");

        let stored = find_column(&connection, "c1")
            .expect("reads")
            .expect("exists");
        assert_eq!(affected, 1);
        assert_eq!(stored, changed);
    }

    #[test]
    fn delete_column_is_blocked_by_the_database_while_tasks_remain() {
        let connection = migrated_connection();
        insert_board(&connection, &board("b1")).expect("board");
        insert_column(&connection, &column("c1", "b1", "V")).expect("column");
        insert_task(&connection, "t1", "b1", "c1");

        let result = delete_column(&connection, "c1");

        assert!(result.is_err());
    }

    #[test]
    fn detach_moves_every_task_of_the_board_to_the_backlog() {
        let connection = migrated_connection();
        insert_board(&connection, &board("b1")).expect("board");
        insert_board(&connection, &board("b2")).expect("board");
        insert_column(&connection, &column("c1", "b1", "V")).expect("column");
        insert_column(&connection, &column("c2", "b2", "V")).expect("column");
        insert_task(&connection, "t1", "b1", "c1");
        insert_task(&connection, "t2", "b1", "c1");
        insert_task(&connection, "other", "b2", "c2");
        connection
            .execute("UPDATE tasks SET archived_at = ?1 WHERE id = 't2'", [NOW])
            .expect("archives");

        let ids = find_task_ids_on_board(&connection, "b1").expect("reads");
        let affected = detach_tasks_from_board(&connection, "b1", "2026-11-09T00:00:00.000Z")
            .expect("detaches");

        assert_eq!(ids, ["t1", "t2"]);
        assert_eq!(affected, 2);
        let placement: (Option<String>, Option<String>, String) = connection
            .query_row(
                "SELECT board_id, column_id, updated_at FROM tasks WHERE id = 't1'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .expect("reads");
        assert_eq!(
            placement,
            (None, None, "2026-11-09T00:00:00.000Z".to_string())
        );
        assert_eq!(
            find_task_ids_on_board(&connection, "b2").expect("reads"),
            ["other"]
        );
    }
}
