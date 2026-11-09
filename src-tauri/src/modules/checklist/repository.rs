use rusqlite::{Connection, OptionalExtension, Row};

use super::models::ChecklistItem;
use crate::error::AppResult;

const ITEM_COLUMNS: &str = "id, task_id, text, is_done, position, created_at, updated_at";

pub struct ItemSlot {
    pub id: String,
    pub position: String,
}

fn map_item(row: &Row<'_>) -> rusqlite::Result<ChecklistItem> {
    Ok(ChecklistItem {
        id: row.get(0)?,
        task_id: row.get(1)?,
        text: row.get(2)?,
        is_done: row.get(3)?,
        position: row.get(4)?,
        created_at: row.get(5)?,
        updated_at: row.get(6)?,
    })
}

pub fn insert(connection: &Connection, item: &ChecklistItem) -> AppResult<()> {
    connection.execute(
        "INSERT INTO checklist_items (id, task_id, text, is_done, position, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        (
            &item.id,
            &item.task_id,
            &item.text,
            item.is_done,
            &item.position,
            &item.created_at,
            &item.updated_at,
        ),
    )?;
    Ok(())
}

pub fn find_by_id(connection: &Connection, id: &str) -> AppResult<Option<ChecklistItem>> {
    let sql = format!("SELECT {ITEM_COLUMNS} FROM checklist_items WHERE id = ?1");
    let item = connection.query_row(&sql, [id], map_item).optional()?;
    Ok(item)
}

pub fn list_by_task(connection: &Connection, task_id: &str) -> AppResult<Vec<ChecklistItem>> {
    let sql = format!(
        "SELECT {ITEM_COLUMNS} FROM checklist_items WHERE task_id = ?1 ORDER BY position, id"
    );
    let mut statement = connection.prepare(&sql)?;
    let rows = statement.query_map([task_id], map_item)?;
    let items = rows.collect::<Result<Vec<_>, _>>()?;
    Ok(items)
}

pub fn list_slots(connection: &Connection, task_id: &str) -> AppResult<Vec<ItemSlot>> {
    let mut statement = connection.prepare(
        "SELECT id, position FROM checklist_items WHERE task_id = ?1 ORDER BY position, id",
    )?;
    let rows = statement.query_map([task_id], |row| {
        Ok(ItemSlot {
            id: row.get(0)?,
            position: row.get(1)?,
        })
    })?;
    let slots = rows.collect::<Result<Vec<_>, _>>()?;
    Ok(slots)
}

pub fn update_fields(connection: &Connection, item: &ChecklistItem) -> AppResult<usize> {
    let affected = connection.execute(
        "UPDATE checklist_items SET text = ?2, is_done = ?3, updated_at = ?4 WHERE id = ?1",
        (&item.id, &item.text, item.is_done, &item.updated_at),
    )?;
    Ok(affected)
}

pub fn set_position(
    connection: &Connection,
    id: &str,
    position: &str,
    updated_at: &str,
) -> AppResult<usize> {
    let affected = connection.execute(
        "UPDATE checklist_items SET position = ?2, updated_at = ?3 WHERE id = ?1",
        (id, position, updated_at),
    )?;
    Ok(affected)
}

pub fn delete(connection: &Connection, id: &str) -> AppResult<usize> {
    let affected = connection.execute("DELETE FROM checklist_items WHERE id = ?1", [id])?;
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
            .execute_batch(
                "INSERT INTO projects (id, name, created_at, updated_at) VALUES ('p1', 'P', 'x', 'x');
                 INSERT INTO tasks (id, project_id, title, position, created_at, updated_at) VALUES ('t1', 'p1', 'T', 'V', 'x', 'x');
                 INSERT INTO tasks (id, project_id, title, position, created_at, updated_at) VALUES ('t2', 'p1', 'T2', 'W', 'x', 'x');",
            )
            .expect("seeds");
        connection
    }

    fn item(id: &str, task_id: &str, position: &str) -> ChecklistItem {
        ChecklistItem {
            id: id.into(),
            task_id: task_id.into(),
            text: format!("Item {id}"),
            is_done: false,
            position: position.into(),
            created_at: NOW.into(),
            updated_at: NOW.into(),
        }
    }

    #[test]
    fn insert_then_find_round_trips_every_field() {
        let connection = migrated_connection();
        let mut original = item("i1", "t1", "V");
        original.is_done = true;

        insert(&connection, &original).expect("inserts");
        let found = find_by_id(&connection, "i1").expect("reads");

        assert_eq!(found, Some(original));
        assert_eq!(find_by_id(&connection, "ghost").expect("reads"), None);
    }

    #[test]
    fn list_is_scoped_to_the_task_and_ordered_by_position() {
        let connection = migrated_connection();
        insert(&connection, &item("b", "t1", "N")).expect("inserts");
        insert(&connection, &item("a", "t1", "H")).expect("inserts");
        insert(&connection, &item("other", "t2", "A")).expect("inserts");

        let ids: Vec<String> = list_by_task(&connection, "t1")
            .expect("lists")
            .into_iter()
            .map(|item| item.id)
            .collect();
        let slots: Vec<String> = list_slots(&connection, "t1")
            .expect("lists")
            .into_iter()
            .map(|slot| slot.id)
            .collect();

        assert_eq!(ids, ["a", "b"]);
        assert_eq!(slots, ["a", "b"]);
    }

    #[test]
    fn update_set_position_and_delete_report_affected_rows() {
        let connection = migrated_connection();
        insert(&connection, &item("i1", "t1", "V")).expect("inserts");
        let mut changed = item("i1", "t1", "V");
        changed.text = "Renamed".into();
        changed.is_done = true;

        let updated = update_fields(&connection, &changed).expect("updates");
        let moved = set_position(&connection, "i1", "X", NOW).expect("moves");
        let reloaded = find_by_id(&connection, "i1")
            .expect("reads")
            .expect("exists");
        let deleted = delete(&connection, "i1").expect("deletes");
        let deleted_again = delete(&connection, "i1").expect("deletes");

        assert_eq!((updated, moved, deleted, deleted_again), (1, 1, 1, 0));
        assert_eq!(reloaded.text, "Renamed");
        assert!(reloaded.is_done);
        assert_eq!(reloaded.position, "X");
    }
}
