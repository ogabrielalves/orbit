#![allow(clippy::expect_used)]

mod common;

use common::{NOW, connection_with_project, count, insert_board, migrated_connection};
use rusqlite::Connection;

fn hits(connection: &Connection, expression: &str) -> Vec<(String, String)> {
    let mut statement = connection
        .prepare(
            "SELECT e.entity_type, e.entity_id
             FROM search_index JOIN search_entries e ON e.id = search_index.rowid
             WHERE search_index MATCH ?1 ORDER BY e.entity_type, e.entity_id",
        )
        .expect("prepares");
    statement
        .query_map([expression], |row| Ok((row.get(0)?, row.get(1)?)))
        .expect("runs")
        .collect::<Result<_, _>>()
        .expect("reads")
}

fn entry_count(connection: &Connection) -> (i64, i64) {
    (
        count(connection, "search_entries"),
        count(connection, "search_index"),
    )
}

fn insert_task(connection: &Connection, id: &str, title: &str, description: &str) {
    connection
        .execute(
            "INSERT INTO tasks (id, project_id, title, description, position, created_at, updated_at)
             VALUES (?1, 'p1', ?2, ?3, 'V', ?4, ?4)",
            (id, title, description, NOW),
        )
        .expect("task");
}

#[test]
fn a_new_project_board_and_task_are_searchable_right_away() {
    let connection = migrated_connection();
    connection
        .execute(
            "INSERT INTO projects (id, name, description, created_at, updated_at) VALUES ('p1', 'Website redesign', 'Landing page refresh', ?1, ?1)",
            [NOW],
        )
        .expect("project");
    insert_board(&connection, "b1", "p1").expect("board");
    insert_task(&connection, "t1", "Write copy", "Hero section text");

    assert_eq!(
        hits(&connection, "redesign"),
        [("project".to_string(), "p1".to_string())]
    );
    assert_eq!(
        hits(&connection, "refresh"),
        [("project".to_string(), "p1".to_string())]
    );
    assert_eq!(
        hits(&connection, "board"),
        [("board".to_string(), "b1".to_string())]
    );
    assert_eq!(
        hits(&connection, "hero"),
        [("task".to_string(), "t1".to_string())]
    );
    assert_eq!(entry_count(&connection), (3, 3));
}

#[test]
fn updates_replace_the_old_text_instead_of_adding_to_it() {
    let connection = connection_with_project();
    insert_task(&connection, "t1", "Old title", "old description");

    connection
        .execute(
            "UPDATE tasks SET title = 'Fresh title', description = 'fresh text' WHERE id = 't1'",
            [],
        )
        .expect("updates task");
    connection
        .execute(
            "UPDATE projects SET name = 'Renamed project' WHERE id = 'p1'",
            [],
        )
        .expect("updates project");
    insert_board(&connection, "b1", "p1").expect("board");
    connection
        .execute(
            "UPDATE boards SET name = 'Sprint board' WHERE id = 'b1'",
            [],
        )
        .expect("updates board");

    assert!(hits(&connection, "old").is_empty());
    assert_eq!(
        hits(&connection, "fresh"),
        [("task".to_string(), "t1".to_string())]
    );
    assert_eq!(
        hits(&connection, "renamed"),
        [("project".to_string(), "p1".to_string())]
    );
    assert_eq!(
        hits(&connection, "sprint"),
        [("board".to_string(), "b1".to_string())]
    );
    assert_eq!(entry_count(&connection), (3, 3));
}

#[test]
fn changes_to_other_columns_do_not_touch_the_index() {
    let connection = connection_with_project();
    insert_task(&connection, "t1", "Stable", "text");
    let before = entry_count(&connection);

    connection
        .execute(
            "UPDATE tasks SET priority = 'high', updated_at = 'later' WHERE id = 't1'",
            [],
        )
        .expect("updates");

    assert_eq!(entry_count(&connection), before);
    assert_eq!(hits(&connection, "stable").len(), 1);
}

#[test]
fn deleting_removes_the_entities_and_cascades_through_boards_and_tasks() {
    let connection = connection_with_project();
    insert_board(&connection, "b1", "p1").expect("board");
    insert_task(&connection, "t1", "Task one", "");
    insert_task(&connection, "t2", "Task two", "");
    connection
        .execute("DELETE FROM tasks WHERE id = 't1'", [])
        .expect("deletes task");
    assert!(hits(&connection, "one").is_empty());
    assert_eq!(hits(&connection, "two").len(), 1);

    connection
        .execute("DELETE FROM projects WHERE id = 'p1'", [])
        .expect("deletes project");

    assert_eq!(entry_count(&connection), (0, 0));
}

#[test]
fn search_ignores_accents_and_case_and_supports_prefixes() {
    let connection = connection_with_project();
    insert_task(&connection, "t1", "Reunião de Ação Rápida", "");
    insert_task(&connection, "t2", "Spring Boot setup", "");

    assert_eq!(hits(&connection, "reuniao").len(), 1);
    assert_eq!(hits(&connection, "ACAO").len(), 1);
    assert_eq!(hits(&connection, "\"rapida\"").len(), 1);
    assert_eq!(hits(&connection, "spr*").len(), 1);
    assert_eq!(hits(&connection, "bo*").len(), 1);
    assert!(
        hits(&connection, "pring").is_empty(),
        "only prefixes match, not substrings"
    );
}

#[test]
fn entries_are_unique_per_entity_and_restricted_to_known_types() {
    let connection = migrated_connection();
    connection
        .execute(
            "INSERT INTO search_entries (entity_type, entity_id) VALUES ('note', 'n1')",
            [],
        )
        .expect("inserts");

    let duplicate = connection.execute(
        "INSERT INTO search_entries (entity_type, entity_id) VALUES ('note', 'n1')",
        [],
    );
    let unknown = connection.execute(
        "INSERT INTO search_entries (entity_type, entity_id) VALUES ('spaceship', 'x')",
        [],
    );
    let blank = connection.execute(
        "INSERT INTO search_entries (entity_type, entity_id) VALUES ('note', '')",
        [],
    );

    assert!(duplicate.is_err());
    assert!(unknown.is_err());
    assert!(blank.is_err());
}

#[test]
fn deleting_a_note_row_removes_its_search_entry() {
    let connection = migrated_connection();
    connection
        .execute(
            "INSERT INTO notes (id, path, title, title_key, hash, created_at, modified_at)
             VALUES ('n1', 'a.md', 'A', 'a', ?1, ?2, ?2)",
            ("e".repeat(64), NOW),
        )
        .expect("note");
    connection
        .execute(
            "INSERT INTO search_entries (entity_type, entity_id) VALUES ('note', 'n1')",
            [],
        )
        .expect("entry");
    connection
        .execute(
            "INSERT INTO search_index (rowid, title, body)
             SELECT id, 'A', 'note body words' FROM search_entries WHERE entity_id = 'n1'",
            [],
        )
        .expect("index");
    assert_eq!(hits(&connection, "words").len(), 1);

    connection
        .execute("DELETE FROM notes WHERE id = 'n1'", [])
        .expect("deletes");

    assert_eq!(entry_count(&connection), (0, 0));
}

#[test]
fn the_entity_lookup_uses_the_unique_index_so_writes_never_scan_the_table() {
    let connection = migrated_connection();

    let plan: Vec<String> = connection
        .prepare(
            "EXPLAIN QUERY PLAN SELECT id FROM search_entries
             WHERE entity_type = 'task' AND entity_id = 'x'",
        )
        .expect("prepares")
        .query_map([], |row| row.get::<_, String>(3))
        .expect("runs")
        .collect::<Result<_, _>>()
        .expect("reads");

    assert!(
        plan.iter()
            .any(|line| line.contains("sqlite_autoindex_search_entries")),
        "plan was: {plan:?}"
    );
}
