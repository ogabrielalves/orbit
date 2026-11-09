use rusqlite::{Connection, OptionalExtension, Row};

use super::models::Comment;
use crate::error::AppResult;

const COMMENT_COLUMNS: &str = "id, task_id, body, created_at, updated_at";

fn map_comment(row: &Row<'_>) -> rusqlite::Result<Comment> {
    Ok(Comment {
        id: row.get(0)?,
        task_id: row.get(1)?,
        body: row.get(2)?,
        created_at: row.get(3)?,
        updated_at: row.get(4)?,
    })
}

pub fn insert(connection: &Connection, comment: &Comment) -> AppResult<()> {
    connection.execute(
        "INSERT INTO comments (id, task_id, body, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        (
            &comment.id,
            &comment.task_id,
            &comment.body,
            &comment.created_at,
            &comment.updated_at,
        ),
    )?;
    Ok(())
}

pub fn find_by_id(connection: &Connection, id: &str) -> AppResult<Option<Comment>> {
    let sql = format!("SELECT {COMMENT_COLUMNS} FROM comments WHERE id = ?1");
    let comment = connection.query_row(&sql, [id], map_comment).optional()?;
    Ok(comment)
}

pub fn list_by_task(connection: &Connection, task_id: &str) -> AppResult<Vec<Comment>> {
    let sql = format!(
        "SELECT {COMMENT_COLUMNS} FROM comments WHERE task_id = ?1 ORDER BY created_at, id"
    );
    let mut statement = connection.prepare(&sql)?;
    let rows = statement.query_map([task_id], map_comment)?;
    let comments = rows.collect::<Result<Vec<_>, _>>()?;
    Ok(comments)
}

pub fn count_by_task(connection: &Connection, task_id: &str) -> AppResult<u32> {
    let count = connection.query_row(
        "SELECT COUNT(*) FROM comments WHERE task_id = ?1",
        [task_id],
        |row| row.get(0),
    )?;
    Ok(count)
}

pub fn update_body(
    connection: &Connection,
    id: &str,
    body: &str,
    updated_at: &str,
) -> AppResult<usize> {
    let affected = connection.execute(
        "UPDATE comments SET body = ?2, updated_at = ?3 WHERE id = ?1",
        (id, body, updated_at),
    )?;
    Ok(affected)
}

pub fn delete(connection: &Connection, id: &str) -> AppResult<usize> {
    let affected = connection.execute("DELETE FROM comments WHERE id = ?1", [id])?;
    Ok(affected)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{connection::open_in_memory, migrations};

    fn migrated_connection() -> Connection {
        let mut connection = open_in_memory().expect("opens");
        migrations::run(&mut connection).expect("migrates");
        connection
            .execute_batch(
                "INSERT INTO projects (id, name, created_at, updated_at) VALUES ('p1', 'P', 'x', 'x');
                 INSERT INTO tasks (id, project_id, title, position, created_at, updated_at) VALUES ('t1', 'p1', 'T', 'V', 'x', 'x');
                 INSERT INTO tasks (id, project_id, title, position, created_at, updated_at) VALUES ('t2', 'p1', 'T2', 'W', 'x', 'x');",
            )
            .expect("seeds");
        connection
    }

    fn comment(id: &str, task_id: &str, created_at: &str) -> Comment {
        Comment {
            id: id.into(),
            task_id: task_id.into(),
            body: format!("Body {id}"),
            created_at: created_at.into(),
            updated_at: created_at.into(),
        }
    }

    #[test]
    fn insert_then_find_round_trips_every_field() {
        let connection = migrated_connection();
        let original = comment("c1", "t1", "2026-11-08T10:00:00.000Z");

        insert(&connection, &original).expect("inserts");

        assert_eq!(
            find_by_id(&connection, "c1").expect("reads"),
            Some(original)
        );
        assert_eq!(find_by_id(&connection, "ghost").expect("reads"), None);
    }

    #[test]
    fn list_is_scoped_to_the_task_oldest_first_and_counted() {
        let connection = migrated_connection();
        insert(
            &connection,
            &comment("late", "t1", "2026-11-08T12:00:00.000Z"),
        )
        .expect("inserts");
        insert(
            &connection,
            &comment("early", "t1", "2026-11-08T09:00:00.000Z"),
        )
        .expect("inserts");
        insert(
            &connection,
            &comment("other", "t2", "2026-11-08T08:00:00.000Z"),
        )
        .expect("inserts");

        let ids: Vec<String> = list_by_task(&connection, "t1")
            .expect("lists")
            .into_iter()
            .map(|comment| comment.id)
            .collect();

        assert_eq!(ids, ["early", "late"]);
        assert_eq!(count_by_task(&connection, "t1").expect("counts"), 2);
        assert_eq!(count_by_task(&connection, "none").expect("counts"), 0);
    }

    #[test]
    fn update_body_and_delete_report_affected_rows() {
        let connection = migrated_connection();
        insert(
            &connection,
            &comment("c1", "t1", "2026-11-08T10:00:00.000Z"),
        )
        .expect("inserts");

        let updated =
            update_body(&connection, "c1", "Edited", "2026-11-08T11:00:00.000Z").expect("updates");
        let reloaded = find_by_id(&connection, "c1")
            .expect("reads")
            .expect("exists");
        let deleted = delete(&connection, "c1").expect("deletes");
        let deleted_again = delete(&connection, "c1").expect("deletes");

        assert_eq!((updated, deleted, deleted_again), (1, 1, 0));
        assert_eq!(reloaded.body, "Edited");
        assert_eq!(reloaded.updated_at, "2026-11-08T11:00:00.000Z");
        assert_eq!(reloaded.created_at, "2026-11-08T10:00:00.000Z");
    }
}
