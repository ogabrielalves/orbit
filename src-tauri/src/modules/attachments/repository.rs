use rusqlite::{Connection, OptionalExtension, Row};

use super::models::Attachment;
use crate::error::AppResult;

const ATTACHMENT_COLUMNS: &str = "id, task_id, file_name, mime_type, size_bytes, created_at";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StoredAttachment {
    pub attachment: Attachment,
    pub stored_name: String,
}

fn map_attachment(row: &Row<'_>) -> rusqlite::Result<Attachment> {
    Ok(Attachment {
        id: row.get(0)?,
        task_id: row.get(1)?,
        file_name: row.get(2)?,
        mime_type: row.get(3)?,
        size_bytes: row.get(4)?,
        created_at: row.get(5)?,
    })
}

pub fn insert(connection: &Connection, stored: &StoredAttachment) -> AppResult<()> {
    let attachment = &stored.attachment;
    connection.execute(
        "INSERT INTO attachments (id, task_id, file_name, stored_name, mime_type, size_bytes, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        (
            &attachment.id,
            &attachment.task_id,
            &attachment.file_name,
            &stored.stored_name,
            &attachment.mime_type,
            attachment.size_bytes,
            &attachment.created_at,
        ),
    )?;
    Ok(())
}

pub fn find_by_id(connection: &Connection, id: &str) -> AppResult<Option<StoredAttachment>> {
    let sql = format!("SELECT {ATTACHMENT_COLUMNS}, stored_name FROM attachments WHERE id = ?1");
    let stored = connection
        .query_row(&sql, [id], |row| {
            Ok(StoredAttachment {
                attachment: map_attachment(row)?,
                stored_name: row.get(6)?,
            })
        })
        .optional()?;
    Ok(stored)
}

pub fn list_by_task(connection: &Connection, task_id: &str) -> AppResult<Vec<Attachment>> {
    let sql = format!(
        "SELECT {ATTACHMENT_COLUMNS} FROM attachments WHERE task_id = ?1 ORDER BY created_at, id"
    );
    let mut statement = connection.prepare(&sql)?;
    let rows = statement.query_map([task_id], map_attachment)?;
    let attachments = rows.collect::<Result<Vec<_>, _>>()?;
    Ok(attachments)
}

pub fn count_by_task(connection: &Connection, task_id: &str) -> AppResult<u32> {
    let count = connection.query_row(
        "SELECT COUNT(*) FROM attachments WHERE task_id = ?1",
        [task_id],
        |row| row.get(0),
    )?;
    Ok(count)
}

pub fn delete(connection: &Connection, id: &str) -> AppResult<usize> {
    let affected = connection.execute("DELETE FROM attachments WHERE id = ?1", [id])?;
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

    fn stored(id: &str, task_id: &str, stored_name: &str, created_at: &str) -> StoredAttachment {
        StoredAttachment {
            attachment: Attachment {
                id: id.into(),
                task_id: task_id.into(),
                file_name: format!("{id}.txt"),
                mime_type: "text/plain".into(),
                size_bytes: 12,
                created_at: created_at.into(),
            },
            stored_name: stored_name.into(),
        }
    }

    #[test]
    fn insert_then_find_round_trips_every_field_including_the_stored_name() {
        let connection = migrated_connection();
        let original = stored("a1", "t1", "s1.txt", "2026-11-08T10:00:00.000Z");

        insert(&connection, &original).expect("inserts");

        assert_eq!(
            find_by_id(&connection, "a1").expect("reads"),
            Some(original)
        );
        assert_eq!(find_by_id(&connection, "ghost").expect("reads"), None);
    }

    #[test]
    fn stored_names_are_unique() {
        let connection = migrated_connection();
        insert(&connection, &stored("a1", "t1", "same.txt", "x")).expect("inserts");

        let duplicate = insert(&connection, &stored("a2", "t1", "same.txt", "x"));

        assert!(duplicate.is_err());
    }

    #[test]
    fn list_is_scoped_to_the_task_oldest_first_and_counted() {
        let connection = migrated_connection();
        insert(
            &connection,
            &stored("late", "t1", "s1", "2026-11-08T12:00:00.000Z"),
        )
        .expect("inserts");
        insert(
            &connection,
            &stored("early", "t1", "s2", "2026-11-08T09:00:00.000Z"),
        )
        .expect("inserts");
        insert(
            &connection,
            &stored("other", "t2", "s3", "2026-11-08T08:00:00.000Z"),
        )
        .expect("inserts");

        let ids: Vec<String> = list_by_task(&connection, "t1")
            .expect("lists")
            .into_iter()
            .map(|attachment| attachment.id)
            .collect();

        assert_eq!(ids, ["early", "late"]);
        assert_eq!(count_by_task(&connection, "t1").expect("counts"), 2);
        assert_eq!(count_by_task(&connection, "none").expect("counts"), 0);
    }

    #[test]
    fn delete_reports_affected_rows() {
        let connection = migrated_connection();
        insert(&connection, &stored("a1", "t1", "s1", "x")).expect("inserts");

        let first = delete(&connection, "a1").expect("deletes");
        let second = delete(&connection, "a1").expect("deletes");

        assert_eq!((first, second), (1, 0));
    }

    #[test]
    fn deleting_the_task_cascades_to_its_attachments() {
        let connection = migrated_connection();
        insert(&connection, &stored("a1", "t1", "s1", "x")).expect("inserts");

        connection
            .execute("DELETE FROM tasks WHERE id = 't1'", [])
            .expect("deletes task");

        assert_eq!(find_by_id(&connection, "a1").expect("reads"), None);
    }
}
