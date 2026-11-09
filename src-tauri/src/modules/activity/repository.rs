use rusqlite::Connection;

use crate::error::AppResult;

pub struct NewRow<'a> {
    pub id: &'a str,
    pub entity_type: &'a str,
    pub entity_id: &'a str,
    pub action: &'a str,
    pub changes: Option<&'a str>,
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
        "INSERT INTO activity_log (id, entity_type, entity_id, action, changes, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        (
            row.id,
            row.entity_type,
            row.entity_id,
            row.action,
            row.changes,
            row.created_at,
        ),
    )?;
    Ok(())
}

pub fn find_recent(connection: &Connection, limit: u32) -> AppResult<Vec<StoredRow>> {
    let mut statement = connection.prepare(
        "SELECT id, entity_type, entity_id, action, changes, created_at
         FROM activity_log
         ORDER BY created_at DESC, id DESC
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
         ORDER BY created_at DESC, id DESC
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
    fn find_recent_breaks_ties_by_id_descending() {
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
}
