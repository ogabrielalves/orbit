#![allow(clippy::expect_used)]
#![allow(dead_code)]

use orbit_lib::db::{connection::open_in_memory, migrations};
use rusqlite::Connection;

pub const NOW: &str = "2026-11-08T10:00:00.000Z";

pub fn migrated_connection() -> Connection {
    let mut connection = open_in_memory().expect("opens in memory");
    migrations::run(&mut connection).expect("migrates");
    connection
}

pub fn query_plan(connection: &Connection, sql: &str) -> String {
    let mut statement = connection
        .prepare(&format!("EXPLAIN QUERY PLAN {sql}"))
        .expect("prepares plan");
    let details = statement
        .query_map([], |row| row.get::<_, String>(3))
        .expect("runs plan")
        .collect::<Result<Vec<_>, _>>()
        .expect("reads plan");
    details.join(" | ")
}

pub fn count(connection: &Connection, table: &str) -> i64 {
    connection
        .query_row(&format!("SELECT COUNT(*) FROM {table}"), [], |row| {
            row.get(0)
        })
        .expect("counts rows")
}

pub fn insert_project(connection: &Connection, id: &str) -> rusqlite::Result<usize> {
    connection.execute(
        "INSERT INTO projects (id, name, created_at, updated_at) VALUES (?1, 'Project', ?2, ?2)",
        (id, NOW),
    )
}

pub fn insert_board(
    connection: &Connection,
    id: &str,
    project_id: &str,
) -> rusqlite::Result<usize> {
    connection.execute(
        "INSERT INTO boards (id, project_id, name, created_at, updated_at) VALUES (?1, ?2, 'Board', ?3, ?3)",
        (id, project_id, NOW),
    )
}

pub fn insert_column(
    connection: &Connection,
    id: &str,
    board_id: &str,
    position: &str,
) -> rusqlite::Result<usize> {
    connection.execute(
        "INSERT INTO columns (id, board_id, name, position, created_at, updated_at) VALUES (?1, ?2, 'Column', ?3, ?4, ?4)",
        (id, board_id, position, NOW),
    )
}

pub fn connection_with_project() -> Connection {
    let connection = migrated_connection();
    insert_project(&connection, "p1").expect("project");
    connection
}

pub fn connection_with_task() -> Connection {
    let connection = connection_with_project();
    connection
        .execute(
            "INSERT INTO tasks (id, project_id, title, position, created_at, updated_at) VALUES ('t1', 'p1', 'Task', 'V', ?1, ?1)",
            [NOW],
        )
        .expect("task");
    connection
}

pub fn project_with_board_and_column(connection: &Connection) {
    insert_project(connection, "p1").expect("project");
    insert_board(connection, "b1", "p1").expect("board");
    insert_column(connection, "c1", "b1", "V").expect("column");
}
