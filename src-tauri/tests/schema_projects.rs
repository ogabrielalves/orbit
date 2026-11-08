mod common;

use common::{migrated_connection, query_plan};
use rusqlite::Connection;

const NOW: &str = "2026-11-08T10:00:00.000Z";

fn insert_project(connection: &Connection, id: &str, name: &str) -> rusqlite::Result<usize> {
    connection.execute(
        "INSERT INTO projects (id, name, created_at, updated_at) VALUES (?1, ?2, ?3, ?3)",
        (id, name, NOW),
    )
}

fn insert_project_with_status(connection: &Connection, status: &str) -> rusqlite::Result<usize> {
    connection.execute(
        "INSERT INTO projects (id, name, status, created_at, updated_at) VALUES ('p', 'Name', ?1, ?2, ?2)",
        (status, NOW),
    )
}

#[test]
fn applies_defaults_for_status_description_and_optional_fields() {
    let connection = migrated_connection();

    insert_project(&connection, "p1", "ORBIT").expect("inserts");

    let (status, description, icon, color, archived_at): (
        String,
        String,
        Option<String>,
        Option<String>,
        Option<String>,
    ) = connection
        .query_row(
            "SELECT status, description, icon, color, archived_at FROM projects WHERE id = 'p1'",
            [],
            |row| {
                Ok((
                    row.get(0)?,
                    row.get(1)?,
                    row.get(2)?,
                    row.get(3)?,
                    row.get(4)?,
                ))
            },
        )
        .expect("reads");
    assert_eq!(status, "active");
    assert_eq!(description, "");
    assert_eq!((icon, color, archived_at), (None, None, None));
}

#[test]
fn accepts_every_valid_status() {
    let connection = migrated_connection();

    for (index, status) in ["active", "paused", "completed"].iter().enumerate() {
        let result = connection.execute(
            "INSERT INTO projects (id, name, status, created_at, updated_at) VALUES (?1, 'Name', ?2, ?3, ?3)",
            (format!("p{index}"), status, NOW),
        );
        assert!(result.is_ok(), "status {status} should be accepted");
    }
}

#[test]
fn rejects_unknown_status() {
    let connection = migrated_connection();

    let result = insert_project_with_status(&connection, "deleted");

    assert!(result.is_err());
}

#[test]
fn archiving_is_not_a_status() {
    let connection = migrated_connection();

    let result = insert_project_with_status(&connection, "archived");

    assert!(result.is_err());
}

#[test]
fn rejects_empty_and_blank_names() {
    let connection = migrated_connection();

    assert!(insert_project(&connection, "p1", "").is_err());
    assert!(insert_project(&connection, "p2", "   ").is_err());
}

#[test]
fn rejects_null_name_and_timestamps() {
    let connection = migrated_connection();

    let without_name = connection.execute(
        "INSERT INTO projects (id, name, created_at, updated_at) VALUES ('p1', NULL, ?1, ?1)",
        [NOW],
    );
    let without_created_at = connection.execute(
        "INSERT INTO projects (id, name, created_at, updated_at) VALUES ('p2', 'Name', NULL, ?1)",
        [NOW],
    );
    let without_updated_at = connection.execute(
        "INSERT INTO projects (id, name, created_at, updated_at) VALUES ('p3', 'Name', ?1, NULL)",
        [NOW],
    );

    assert!(without_name.is_err());
    assert!(without_created_at.is_err());
    assert!(without_updated_at.is_err());
}

#[test]
fn rejects_duplicate_ids_but_allows_duplicate_names() {
    let connection = migrated_connection();
    insert_project(&connection, "p1", "ORBIT").expect("first insert");

    let duplicate_id = insert_project(&connection, "p1", "Other");
    let duplicate_name = insert_project(&connection, "p2", "ORBIT");

    assert!(duplicate_id.is_err());
    assert!(duplicate_name.is_ok());
}

#[test]
fn status_filter_listing_uses_its_index() {
    let connection = migrated_connection();

    let plan = query_plan(
        &connection,
        "SELECT id FROM projects WHERE archived_at IS NULL AND status = 'active' ORDER BY updated_at DESC",
    );

    assert!(
        plan.contains("idx_projects_archived_status_updated"),
        "plan was: {plan}"
    );
}

#[test]
fn name_ordered_listing_uses_its_index() {
    let connection = migrated_connection();

    let plan = query_plan(
        &connection,
        "SELECT id FROM projects WHERE archived_at IS NULL ORDER BY name COLLATE NOCASE",
    );

    assert!(
        plan.contains("idx_projects_archived_name"),
        "plan was: {plan}"
    );
}
