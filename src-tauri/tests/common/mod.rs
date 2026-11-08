#![allow(clippy::expect_used)]

use orbit_lib::db::{connection::open_in_memory, migrations};
use rusqlite::Connection;

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
