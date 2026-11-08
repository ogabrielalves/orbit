use rusqlite::Connection;
use rusqlite_migration::{M, Migrations};

use crate::error::AppResult;

const MIGRATIONS: &[M<'static>] = &[M::up(include_str!("../../migrations/0001_init.sql"))];

pub fn run(connection: &mut Connection) -> AppResult<()> {
    Migrations::from_slice(MIGRATIONS).to_latest(connection)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::connection::open_in_memory;

    fn table_exists(connection: &Connection, name: &str) -> bool {
        connection
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = ?1",
                [name],
                |row| row.get::<_, i64>(0),
            )
            .expect("query runs")
            == 1
    }

    #[test]
    fn creates_settings_table() {
        let mut connection = open_in_memory().expect("opens");

        run(&mut connection).expect("migrates");

        assert!(table_exists(&connection, "settings"));
    }

    #[test]
    fn running_twice_is_idempotent() {
        let mut connection = open_in_memory().expect("opens");

        run(&mut connection).expect("first run");
        let second_run = run(&mut connection);

        assert!(second_run.is_ok());
    }

    #[test]
    fn migration_list_is_valid() {
        let result = Migrations::from_slice(MIGRATIONS).validate();

        assert!(result.is_ok());
    }
}
