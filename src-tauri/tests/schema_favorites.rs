#![allow(clippy::expect_used)]

mod common;

use common::{NOW, connection_with_project, count, insert_board, migrated_connection, query_plan};
use rusqlite::Connection;

fn favorite(
    connection: &Connection,
    entity_type: &str,
    entity_id: &str,
    position: &str,
) -> rusqlite::Result<usize> {
    connection.execute(
        "INSERT INTO favorites (entity_type, entity_id, position, created_at) VALUES (?1, ?2, ?3, ?4)",
        (entity_type, entity_id, position, NOW),
    )
}

#[test]
fn a_favorite_is_unique_per_entity_and_has_a_unique_position() {
    let connection = migrated_connection();
    favorite(&connection, "project", "p1", "V").expect("inserts");

    assert!(
        favorite(&connection, "project", "p1", "W").is_err(),
        "same entity twice"
    );
    assert!(
        favorite(&connection, "project", "p2", "V").is_err(),
        "same position twice"
    );
    assert!(
        favorite(&connection, "board", "p1", "X").is_ok(),
        "same id, other type"
    );
}

#[test]
fn types_ids_and_positions_are_validated() {
    let connection = migrated_connection();

    assert!(favorite(&connection, "spaceship", "x", "V").is_err());
    assert!(favorite(&connection, "note", "", "V").is_err());
    assert!(favorite(&connection, "note", "n", "").is_err());
    assert!(
        favorite(&connection, "note", "n", "V0").is_err(),
        "trailing zero"
    );
    assert!(
        favorite(&connection, "note", "n", "a-b").is_err(),
        "bad character"
    );
    for (index, kind) in ["project", "board", "task", "note", "folder"]
        .into_iter()
        .enumerate()
    {
        assert!(
            favorite(&connection, kind, "x", &format!("K{}", index + 1)).is_ok(),
            "{kind}"
        );
    }
}

#[test]
fn deleting_a_project_board_or_task_removes_its_favorite_including_cascades() {
    let connection = connection_with_project();
    insert_board(&connection, "b1", "p1").expect("board");
    connection
        .execute(
            "INSERT INTO tasks (id, project_id, title, position, created_at, updated_at) VALUES ('t1', 'p1', 'T', 'V', ?1, ?1)",
            [NOW],
        )
        .expect("task");
    favorite(&connection, "board", "b1", "A").expect("inserts");
    favorite(&connection, "task", "t1", "B").expect("inserts");
    favorite(&connection, "project", "p1", "C").expect("inserts");
    favorite(&connection, "folder", "Docs", "D").expect("inserts");

    connection
        .execute("DELETE FROM projects WHERE id = 'p1'", [])
        .expect("deletes project");

    assert_eq!(
        count(&connection, "favorites"),
        1,
        "only the folder favorite is left"
    );
}

#[test]
fn deleting_a_single_entity_removes_only_its_own_favorite() {
    let connection = connection_with_project();
    connection
        .execute(
            "INSERT INTO tasks (id, project_id, title, position, created_at, updated_at) VALUES ('t1', 'p1', 'T', 'V', ?1, ?1), ('t2', 'p1', 'T2', 'W', ?1, ?1)",
            [NOW],
        )
        .expect("tasks");
    favorite(&connection, "task", "t1", "A").expect("inserts");
    favorite(&connection, "task", "t2", "B").expect("inserts");

    connection
        .execute("DELETE FROM tasks WHERE id = 't1'", [])
        .expect("deletes task");

    let left: String = connection
        .query_row("SELECT entity_id FROM favorites", [], |row| row.get(0))
        .expect("one left");
    assert_eq!(left, "t2");
}

#[test]
fn deleting_a_note_row_removes_its_favorite() {
    let connection = migrated_connection();
    connection
        .execute(
            "INSERT INTO notes (id, path, title, title_key, hash, created_at, modified_at)
             VALUES ('n1', 'a.md', 'A', 'a', ?1, ?2, ?2)",
            ("f".repeat(64), NOW),
        )
        .expect("note");
    favorite(&connection, "note", "n1", "A").expect("inserts");

    connection
        .execute("DELETE FROM notes WHERE id = 'n1'", [])
        .expect("deletes");

    assert_eq!(count(&connection, "favorites"), 0);
}

#[test]
fn the_list_is_ordered_by_the_position_index() {
    let connection = migrated_connection();

    let plan = query_plan(
        &connection,
        "SELECT entity_type, entity_id FROM favorites ORDER BY position",
    );

    assert!(plan.contains("idx_favorites_position"), "plan was: {plan}");
}
