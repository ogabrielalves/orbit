mod common;

use common::{
    NOW, connection_with_project, count, insert_board, insert_column, migrated_connection,
    query_plan,
};

#[test]
fn board_requires_an_existing_project() {
    let connection = migrated_connection();

    let result = insert_board(&connection, "b1", "missing");

    assert!(result.is_err());
}

#[test]
fn board_rejects_blank_name_and_null_fields() {
    let connection = connection_with_project();

    let blank_name = connection.execute(
        "INSERT INTO boards (id, project_id, name, created_at, updated_at) VALUES ('b1', 'p1', '  ', ?1, ?1)",
        [NOW],
    );
    let null_name = connection.execute(
        "INSERT INTO boards (id, project_id, name, created_at, updated_at) VALUES ('b2', 'p1', NULL, ?1, ?1)",
        [NOW],
    );
    let null_project = connection.execute(
        "INSERT INTO boards (id, project_id, name, created_at, updated_at) VALUES ('b3', NULL, 'Board', ?1, ?1)",
        [NOW],
    );
    let null_created_at = connection.execute(
        "INSERT INTO boards (id, project_id, name, created_at, updated_at) VALUES ('b4', 'p1', 'Board', NULL, ?1)",
        [NOW],
    );

    assert!(blank_name.is_err());
    assert!(null_name.is_err());
    assert!(null_project.is_err());
    assert!(null_created_at.is_err());
}

#[test]
fn deleting_a_project_deletes_its_boards_and_columns() {
    let connection = connection_with_project();
    insert_board(&connection, "b1", "p1").expect("board");
    insert_column(&connection, "c1", "b1", "V").expect("column");

    connection
        .execute("DELETE FROM projects WHERE id = 'p1'", [])
        .expect("deletes project");

    assert_eq!(count(&connection, "boards"), 0);
    assert_eq!(count(&connection, "columns"), 0);
}

#[test]
fn deleting_a_board_deletes_only_its_own_columns() {
    let connection = connection_with_project();
    insert_board(&connection, "b1", "p1").expect("board 1");
    insert_board(&connection, "b2", "p1").expect("board 2");
    insert_column(&connection, "c1", "b1", "V").expect("column of board 1");
    insert_column(&connection, "c2", "b2", "V").expect("column of board 2");

    connection
        .execute("DELETE FROM boards WHERE id = 'b1'", [])
        .expect("deletes board");

    assert_eq!(count(&connection, "columns"), 1);
}

#[test]
fn column_requires_an_existing_board() {
    let connection = migrated_connection();

    let result = insert_column(&connection, "c1", "missing", "V");

    assert!(result.is_err());
}

#[test]
fn column_rejects_blank_name_and_null_fields() {
    let connection = connection_with_project();
    insert_board(&connection, "b1", "p1").expect("board");

    let blank_name = connection.execute(
        "INSERT INTO columns (id, board_id, name, position, created_at, updated_at) VALUES ('c1', 'b1', '', 'V', ?1, ?1)",
        [NOW],
    );
    let null_position = connection.execute(
        "INSERT INTO columns (id, board_id, name, position, created_at, updated_at) VALUES ('c2', 'b1', 'Name', NULL, ?1, ?1)",
        [NOW],
    );
    let null_board = connection.execute(
        "INSERT INTO columns (id, board_id, name, position, created_at, updated_at) VALUES ('c3', NULL, 'Name', 'V', ?1, ?1)",
        [NOW],
    );

    assert!(blank_name.is_err());
    assert!(null_position.is_err());
    assert!(null_board.is_err());
}

#[test]
fn column_position_must_be_a_valid_fractional_index() {
    let connection = connection_with_project();
    insert_board(&connection, "b1", "p1").expect("board");

    let valid = ["V", "a", "Zz", "V1", "aV3"];
    let invalid = ["", "V0", "0", "a-b", "a b", "ç"];

    for (index, position) in valid.iter().enumerate() {
        let result = insert_column(&connection, &format!("ok{index}"), "b1", position);
        assert!(result.is_ok(), "position {position:?} should be accepted");
    }
    for (index, position) in invalid.iter().enumerate() {
        let result = insert_column(&connection, &format!("bad{index}"), "b1", position);
        assert!(result.is_err(), "position {position:?} should be rejected");
    }
}

#[test]
fn column_position_is_unique_per_board_but_reusable_across_boards() {
    let connection = connection_with_project();
    insert_board(&connection, "b1", "p1").expect("board 1");
    insert_board(&connection, "b2", "p1").expect("board 2");
    insert_column(&connection, "c1", "b1", "V").expect("first column");

    let same_board = insert_column(&connection, "c2", "b1", "V");
    let other_board = insert_column(&connection, "c3", "b2", "V");

    assert!(same_board.is_err());
    assert!(other_board.is_ok());
}

#[test]
fn board_listing_by_project_uses_its_index() {
    let connection = migrated_connection();

    let plan = query_plan(
        &connection,
        "SELECT id FROM boards WHERE project_id = 'p1' AND archived_at IS NULL ORDER BY created_at",
    );

    assert!(
        plan.contains("idx_boards_project_archived_created"),
        "plan was: {plan}"
    );
}

#[test]
fn column_listing_by_board_is_ordered_by_the_unique_position_index() {
    let connection = migrated_connection();

    let plan = query_plan(
        &connection,
        "SELECT id FROM columns WHERE board_id = 'b1' ORDER BY position",
    );

    assert!(
        plan.contains("USING INDEX") || plan.contains("USING COVERING INDEX"),
        "plan was: {plan}"
    );
    assert!(!plan.contains("TEMP B-TREE"), "plan was: {plan}");
}
