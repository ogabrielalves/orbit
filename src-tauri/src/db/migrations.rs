use rusqlite::Connection;
use rusqlite_migration::{M, Migrations};

use crate::error::AppResult;

const MIGRATIONS: &[M<'static>] = &[
    M::up(include_str!("../../migrations/0001_init.sql")),
    M::up(include_str!("../../migrations/0002_projects.sql")),
    M::up(include_str!("../../migrations/0003_boards_columns.sql")),
    M::up(include_str!("../../migrations/0004_tasks.sql")),
    M::up(include_str!("../../migrations/0005_task_details.sql")),
    M::up(include_str!("../../migrations/0006_activity_log.sql")),
    M::up(include_str!("../../migrations/0007_column_kind.sql")),
];

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

    fn insert_legacy_column(connection: &Connection, id: &str, board_id: &str, position: &str) {
        connection
            .execute(
                "INSERT INTO columns (id, board_id, name, position, created_at, updated_at)
                 VALUES (?1, ?2, ?1, ?3, 'now', 'now')",
                (id, board_id, position),
            )
            .expect("column");
    }

    fn kinds_of(connection: &Connection, board_id: &str) -> Vec<String> {
        let mut statement = connection
            .prepare("SELECT kind FROM columns WHERE board_id = ?1 ORDER BY position")
            .expect("prepares");
        statement
            .query_map([board_id], |row| row.get::<_, String>(0))
            .expect("runs")
            .collect::<Result<_, _>>()
            .expect("reads")
    }

    #[test]
    fn column_kind_migration_backfills_existing_boards_from_position() {
        let mut connection = open_in_memory().expect("opens");
        let migrations = Migrations::from_slice(MIGRATIONS);
        migrations.to_version(&mut connection, 6).expect("up to 6");
        connection
            .execute_batch(
                "INSERT INTO projects (id, name, created_at, updated_at) VALUES ('p', 'P', 'now', 'now');
                 INSERT INTO boards (id, project_id, name, created_at, updated_at) VALUES ('five', 'p', 'B', 'now', 'now');
                 INSERT INTO boards (id, project_id, name, created_at, updated_at) VALUES ('single', 'p', 'B', 'now', 'now');
                 INSERT INTO boards (id, project_id, name, created_at, updated_at) VALUES ('empty', 'p', 'B', 'now', 'now');",
            )
            .expect("seed");
        for (index, position) in ["1", "2", "3", "4", "5"].into_iter().enumerate() {
            insert_legacy_column(&connection, &format!("f{index}"), "five", position);
        }
        insert_legacy_column(&connection, "only", "single", "V");

        migrations.to_latest(&mut connection).expect("up to latest");

        assert_eq!(
            kinds_of(&connection, "five"),
            ["todo", "in_progress", "in_progress", "in_progress", "done"]
        );
        assert_eq!(kinds_of(&connection, "single"), ["todo"]);
        assert!(kinds_of(&connection, "empty").is_empty());
    }
}
