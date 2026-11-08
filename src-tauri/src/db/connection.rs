use std::path::Path;
use std::time::Duration;

use rusqlite::Connection;

use crate::error::AppResult;

const BUSY_TIMEOUT: Duration = Duration::from_secs(5);

pub fn open(path: &Path) -> AppResult<Connection> {
    let connection = Connection::open(path)?;
    configure(&connection)?;
    Ok(connection)
}

pub fn open_in_memory() -> AppResult<Connection> {
    let connection = Connection::open_in_memory()?;
    configure(&connection)?;
    Ok(connection)
}

fn configure(connection: &Connection) -> AppResult<()> {
    connection.busy_timeout(BUSY_TIMEOUT)?;
    connection.execute_batch("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;")?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn pragma_value(connection: &Connection, name: &str) -> String {
        let query = format!("PRAGMA {name}");
        connection
            .query_row(&query, [], |row| row.get::<_, rusqlite::types::Value>(0))
            .map(|value| match value {
                rusqlite::types::Value::Integer(number) => number.to_string(),
                rusqlite::types::Value::Text(text) => text,
                other => format!("{other:?}"),
            })
            .expect("pragma readable")
    }

    #[test]
    fn enables_foreign_keys() {
        let connection = open_in_memory().expect("opens");

        assert_eq!(pragma_value(&connection, "foreign_keys"), "1");
    }

    #[test]
    fn sets_busy_timeout() {
        let connection = open_in_memory().expect("opens");

        assert_eq!(pragma_value(&connection, "busy_timeout"), "5000");
    }

    #[test]
    fn enables_wal_on_file_database() {
        let directory = tempfile::tempdir().expect("creates temp dir");
        let connection = open(&directory.path().join("orbit.db")).expect("opens");

        let mode = pragma_value(&connection, "journal_mode");

        assert_eq!(mode, "wal");
    }
}
