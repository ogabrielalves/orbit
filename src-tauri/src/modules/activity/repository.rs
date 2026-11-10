use rusqlite::{Connection, OptionalExtension};

use crate::error::AppResult;

pub struct NewRow<'a> {
    pub id: &'a str,
    pub entity_type: &'a str,
    pub entity_id: &'a str,
    pub action: &'a str,
    pub changes: Option<&'a str>,
    pub task_id: Option<&'a str>,
    pub created_at: &'a str,
}

pub struct StoredRow {
    pub id: String,
    pub entity_type: String,
    pub entity_id: String,
    pub action: String,
    pub changes: Option<String>,
    pub created_at: String,
}

pub fn insert(connection: &Connection, row: &NewRow<'_>) -> AppResult<()> {
    connection.execute(
        "INSERT INTO activity_log (id, entity_type, entity_id, action, changes, task_id, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        (
            row.id,
            row.entity_type,
            row.entity_id,
            row.action,
            row.changes,
            row.task_id,
            row.created_at,
        ),
    )?;
    Ok(())
}

pub fn find_recent(connection: &Connection, limit: u32) -> AppResult<Vec<StoredRow>> {
    let mut statement = connection.prepare(
        "SELECT id, entity_type, entity_id, action, changes, created_at
         FROM activity_log
         ORDER BY created_at DESC, rowid DESC
         LIMIT ?1",
    )?;
    let rows = statement.query_map([limit], |row| {
        Ok(StoredRow {
            id: row.get(0)?,
            entity_type: row.get(1)?,
            entity_id: row.get(2)?,
            action: row.get(3)?,
            changes: row.get(4)?,
            created_at: row.get(5)?,
        })
    })?;
    let entries = rows.collect::<Result<Vec<_>, _>>()?;
    Ok(entries)
}

pub fn find_task_id(
    connection: &Connection,
    entity_type: &str,
    entity_id: &str,
) -> AppResult<Option<String>> {
    let sql = match entity_type {
        "task" => "SELECT COALESCE(parent_task_id, id) FROM tasks WHERE id = ?1",
        "checklist_item" => {
            "SELECT COALESCE(t.parent_task_id, t.id)
             FROM checklist_items c JOIN tasks t ON t.id = c.task_id WHERE c.id = ?1"
        }
        "comment" => {
            "SELECT COALESCE(t.parent_task_id, t.id)
             FROM comments c JOIN tasks t ON t.id = c.task_id WHERE c.id = ?1"
        }
        "attachment" => {
            "SELECT COALESCE(t.parent_task_id, t.id)
             FROM attachments a JOIN tasks t ON t.id = a.task_id WHERE a.id = ?1"
        }
        _ => return Ok(None),
    };
    let task_id = connection
        .query_row(sql, [entity_id], |row| row.get(0))
        .optional()?;
    Ok(task_id)
}

pub fn find_for_task(
    connection: &Connection,
    task_id: &str,
    limit: u32,
) -> AppResult<Vec<StoredRow>> {
    let mut statement = connection.prepare(
        "SELECT id, entity_type, entity_id, action, changes, created_at
         FROM activity_log
         WHERE task_id = ?1 OR (entity_type = 'task' AND entity_id = ?1)
         ORDER BY created_at DESC, rowid DESC
         LIMIT ?2",
    )?;
    let rows = statement.query_map((task_id, limit), |row| {
        Ok(StoredRow {
            id: row.get(0)?,
            entity_type: row.get(1)?,
            entity_id: row.get(2)?,
            action: row.get(3)?,
            changes: row.get(4)?,
            created_at: row.get(5)?,
        })
    })?;
    let entries = rows.collect::<Result<Vec<_>, _>>()?;
    Ok(entries)
}

pub fn find_by_entity(
    connection: &Connection,
    entity_type: &str,
    entity_id: &str,
    limit: u32,
) -> AppResult<Vec<StoredRow>> {
    let mut statement = connection.prepare(
        "SELECT id, entity_type, entity_id, action, changes, created_at
         FROM activity_log
         WHERE entity_type = ?1 AND entity_id = ?2
         ORDER BY created_at DESC, rowid DESC
         LIMIT ?3",
    )?;
    let rows = statement.query_map((entity_type, entity_id, limit), |row| {
        Ok(StoredRow {
            id: row.get(0)?,
            entity_type: row.get(1)?,
            entity_id: row.get(2)?,
            action: row.get(3)?,
            changes: row.get(4)?,
            created_at: row.get(5)?,
        })
    })?;
    let entries = rows.collect::<Result<Vec<_>, _>>()?;
    Ok(entries)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{connection::open_in_memory, migrations};

    fn migrated_connection() -> Connection {
        let mut connection = open_in_memory().expect("opens");
        migrations::run(&mut connection).expect("migrates");
        connection
    }

    fn row<'a>(id: &'a str, created_at: &'a str) -> NewRow<'a> {
        NewRow {
            id,
            entity_type: "project",
            entity_id: "e1",
            action: "created",
            changes: None,
            task_id: None,
            created_at,
        }
    }

    #[test]
    fn inserts_and_reads_back_a_row_with_changes() {
        let connection = migrated_connection();
        let new_row = NewRow {
            changes: Some(r#"{"name":{"from":"A","to":"B"}}"#),
            action: "updated",
            ..row("a1", "2026-11-08T10:00:00.000Z")
        };

        insert(&connection, &new_row).expect("inserts");

        let rows = find_recent(&connection, 10).expect("reads");
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].id, "a1");
        assert_eq!(rows[0].action, "updated");
        assert_eq!(
            rows[0].changes.as_deref(),
            Some(r#"{"name":{"from":"A","to":"B"}}"#)
        );
    }

    #[test]
    fn find_recent_returns_newest_first_and_respects_the_limit() {
        let connection = migrated_connection();
        insert(&connection, &row("a1", "2026-11-08T10:00:00.000Z")).expect("inserts");
        insert(&connection, &row("a3", "2026-11-08T12:00:00.000Z")).expect("inserts");
        insert(&connection, &row("a2", "2026-11-08T11:00:00.000Z")).expect("inserts");

        let all = find_recent(&connection, 10).expect("reads");
        let two = find_recent(&connection, 2).expect("reads");

        let all_ids: Vec<&str> = all.iter().map(|row| row.id.as_str()).collect();
        assert_eq!(all_ids, ["a3", "a2", "a1"]);
        assert_eq!(two.len(), 2);
    }

    #[test]
    fn find_recent_breaks_ties_by_insertion_order_newest_first() {
        let connection = migrated_connection();
        insert(&connection, &row("a1", "2026-11-08T10:00:00.000Z")).expect("inserts");
        insert(&connection, &row("a2", "2026-11-08T10:00:00.000Z")).expect("inserts");

        let rows = find_recent(&connection, 10).expect("reads");

        let ids: Vec<&str> = rows.iter().map(|row| row.id.as_str()).collect();
        assert_eq!(ids, ["a2", "a1"]);
    }

    #[test]
    fn rejects_values_outside_the_closed_vocabularies() {
        let connection = migrated_connection();
        let bad_type = NewRow {
            entity_type: "spaceship",
            ..row("a1", "2026-11-08T10:00:00.000Z")
        };
        let bad_action = NewRow {
            action: "exploded",
            ..row("a2", "2026-11-08T10:00:00.000Z")
        };

        assert!(insert(&connection, &bad_type).is_err());
        assert!(insert(&connection, &bad_action).is_err());
    }

    #[test]
    fn find_by_entity_is_scoped_ordered_newest_first_and_limited() {
        let connection = migrated_connection();
        insert(&connection, &row("a1", "2026-11-08T10:00:00.000Z")).expect("inserts");
        insert(&connection, &row("a2", "2026-11-08T11:00:00.000Z")).expect("inserts");
        insert(&connection, &row("a3", "2026-11-08T12:00:00.000Z")).expect("inserts");
        let other_entity = NewRow {
            entity_id: "e2",
            ..row("b1", "2026-11-08T13:00:00.000Z")
        };
        let other_type = NewRow {
            entity_type: "task",
            ..row("c1", "2026-11-08T14:00:00.000Z")
        };
        insert(&connection, &other_entity).expect("inserts");
        insert(&connection, &other_type).expect("inserts");

        let all = find_by_entity(&connection, "project", "e1", 10).expect("reads");
        let two = find_by_entity(&connection, "project", "e1", 2).expect("reads");
        let none = find_by_entity(&connection, "project", "ghost", 10).expect("reads");

        let ids: Vec<&str> = all.iter().map(|row| row.id.as_str()).collect();
        assert_eq!(ids, ["a3", "a2", "a1"]);
        assert_eq!(two.len(), 2);
        assert!(none.is_empty());
    }

    #[test]
    fn find_by_entity_uses_the_entity_index() {
        let connection = migrated_connection();

        let mut statement = connection
            .prepare(
                "EXPLAIN QUERY PLAN SELECT id FROM activity_log
                 WHERE entity_type = 'task' AND entity_id = 'x' ORDER BY created_at DESC",
            )
            .expect("prepares");
        let plan: Vec<String> = statement
            .query_map([], |row| row.get::<_, String>(3))
            .expect("runs")
            .collect::<Result<_, _>>()
            .expect("reads");

        assert!(
            plan.iter()
                .any(|line| line.contains("idx_activity_log_entity_created")),
            "plan was: {plan:?}"
        );
    }

    fn seed_task_tree(connection: &Connection) {
        connection
            .execute_batch(
                "INSERT INTO projects (id, name, created_at, updated_at) VALUES ('p', 'P', 'x', 'x');
                 INSERT INTO tasks (id, project_id, title, position, created_at, updated_at) VALUES ('top', 'p', 'T', 'V', 'x', 'x');
                 INSERT INTO tasks (id, project_id, parent_task_id, title, position, created_at, updated_at) VALUES ('sub', 'p', 'top', 'S', 'V', 'x', 'x');
                 INSERT INTO checklist_items (id, task_id, text, position, created_at, updated_at) VALUES ('item', 'sub', 'a', 'V', 'x', 'x');
                 INSERT INTO comments (id, task_id, body, created_at, updated_at) VALUES ('note', 'top', 'c', 'x', 'x');
                 INSERT INTO attachments (id, task_id, file_name, stored_name, mime_type, size_bytes, created_at) VALUES ('file', 'sub', 'f.txt', 's1', 'text/plain', 1, 'x');",
            )
            .expect("seeds");
    }

    #[test]
    fn find_task_id_resolves_to_the_top_level_task_for_every_task_related_entity() {
        let connection = migrated_connection();
        seed_task_tree(&connection);

        let resolve = |entity_type: &str, entity_id: &str| {
            find_task_id(&connection, entity_type, entity_id).expect("reads")
        };

        assert_eq!(resolve("task", "top").as_deref(), Some("top"));
        assert_eq!(resolve("task", "sub").as_deref(), Some("top"));
        assert_eq!(resolve("checklist_item", "item").as_deref(), Some("top"));
        assert_eq!(resolve("comment", "note").as_deref(), Some("top"));
        assert_eq!(resolve("attachment", "file").as_deref(), Some("top"));
    }

    #[test]
    fn find_task_id_is_none_for_other_entities_and_for_missing_rows() {
        let connection = migrated_connection();
        seed_task_tree(&connection);

        assert_eq!(
            find_task_id(&connection, "project", "p").expect("reads"),
            None
        );
        assert_eq!(find_task_id(&connection, "tag", "x").expect("reads"), None);
        assert_eq!(
            find_task_id(&connection, "task", "ghost").expect("reads"),
            None
        );
        assert_eq!(
            find_task_id(&connection, "comment", "ghost").expect("reads"),
            None
        );
    }

    #[test]
    fn find_for_task_gathers_linked_entries_and_the_tasks_own_entity_entries() {
        let connection = migrated_connection();
        let linked = |id: &'static str, created_at: &'static str| NewRow {
            task_id: Some("top"),
            entity_type: "comment",
            entity_id: "note",
            ..row(id, created_at)
        };
        insert(&connection, &linked("a1", "2026-11-08T10:00:00.000Z")).expect("inserts");
        insert(&connection, &linked("a3", "2026-11-08T12:00:00.000Z")).expect("inserts");
        let own_after_deletion = NewRow {
            entity_type: "task",
            entity_id: "top",
            task_id: None,
            ..row("a2", "2026-11-08T11:00:00.000Z")
        };
        let other_task = NewRow {
            task_id: Some("other"),
            ..row("b1", "2026-11-08T13:00:00.000Z")
        };
        insert(&connection, &own_after_deletion).expect("inserts");
        insert(&connection, &other_task).expect("inserts");

        let rows = find_for_task(&connection, "top", 10).expect("reads");
        let limited = find_for_task(&connection, "top", 2).expect("reads");

        let ids: Vec<&str> = rows.iter().map(|row| row.id.as_str()).collect();
        assert_eq!(ids, ["a3", "a2", "a1"]);
        assert_eq!(limited.len(), 2);
    }

    #[test]
    fn find_for_task_uses_indexes_for_both_conditions() {
        let connection = migrated_connection();

        let mut statement = connection
            .prepare(
                "EXPLAIN QUERY PLAN SELECT id FROM activity_log
                 WHERE task_id = 'x' OR (entity_type = 'task' AND entity_id = 'x')
                 ORDER BY created_at DESC, rowid DESC LIMIT 5",
            )
            .expect("prepares");
        let plan: Vec<String> = statement
            .query_map([], |row| row.get::<_, String>(3))
            .expect("runs")
            .collect::<Result<_, _>>()
            .expect("reads");
        let joined = plan.join(" | ");

        assert!(
            joined.contains("idx_activity_log_task_created"),
            "plan was: {joined}"
        );
        assert!(
            joined.contains("idx_activity_log_entity_created"),
            "plan was: {joined}"
        );
    }
}
