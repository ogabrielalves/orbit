use std::collections::HashMap;

use rusqlite::Connection;

use crate::error::AppResult;

pub fn find_all(connection: &Connection) -> AppResult<HashMap<String, String>> {
    let mut statement = connection.prepare("SELECT key, value FROM settings")?;
    let rows = statement.query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?;
    let entries = rows.collect::<Result<HashMap<String, String>, _>>()?;
    Ok(entries)
}

pub fn upsert(connection: &Connection, key: &str, value: &str, updated_at: &str) -> AppResult<()> {
    connection.execute(
        "INSERT INTO settings (key, value, updated_at) VALUES (?1, ?2, ?3)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
        (key, value, updated_at),
    )?;
    Ok(())
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

    #[test]
    fn find_all_is_empty_on_fresh_database() {
        let connection = migrated_connection();

        let entries = find_all(&connection).expect("reads");

        assert!(entries.is_empty());
    }

    #[test]
    fn upsert_inserts_then_overwrites() {
        let connection = migrated_connection();

        upsert(&connection, "language", "en", "2026-01-01T00:00:00.000Z").expect("inserts");
        upsert(&connection, "language", "pt-BR", "2026-01-02T00:00:00.000Z").expect("overwrites");

        let entries = find_all(&connection).expect("reads");
        assert_eq!(entries.len(), 1);
        assert_eq!(entries.get("language").map(String::as_str), Some("pt-BR"));
    }
}
