mod common;

use common::{NOW, count, migrated_connection, query_plan};
use rusqlite::Connection;

fn insert_entry(
    connection: &Connection,
    id: &str,
    entity_type: &str,
    action: &str,
    changes: Option<&str>,
) -> rusqlite::Result<usize> {
    connection.execute(
        "INSERT INTO activity_log (id, entity_type, entity_id, action, changes, created_at) VALUES (?1, ?2, 'e1', ?3, ?4, ?5)",
        (id, entity_type, action, changes, NOW),
    )
}

#[test]
fn stores_an_entry_with_a_json_object_of_changes() {
    let connection = migrated_connection();
    let changes = r#"{"title":{"from":"Old","to":"New"}}"#;

    let result = insert_entry(&connection, "a1", "task", "updated", Some(changes));

    assert!(result.is_ok());
}

#[test]
fn changes_are_optional() {
    let connection = migrated_connection();

    let result = insert_entry(&connection, "a1", "project", "created", None);

    assert!(result.is_ok());
}

#[test]
fn rejects_changes_that_are_not_a_json_object() {
    let connection = migrated_connection();

    let broken_json = insert_entry(&connection, "a1", "task", "updated", Some("{not json"));
    let json_array = insert_entry(&connection, "a2", "task", "updated", Some("[1,2]"));
    let json_scalar = insert_entry(&connection, "a3", "task", "updated", Some("\"text\""));

    assert!(broken_json.is_err());
    assert!(json_array.is_err());
    assert!(json_scalar.is_err());
}

#[test]
fn accepts_every_known_entity_type_and_action() {
    let connection = migrated_connection();
    let entity_types = [
        "project",
        "board",
        "column",
        "task",
        "checklist_item",
        "comment",
        "tag",
        "attachment",
        "note",
        "folder",
    ];
    let actions = [
        "created",
        "updated",
        "deleted",
        "archived",
        "restored",
        "moved",
        "completed",
        "reopened",
        "duplicated",
    ];

    for (index, entity_type) in entity_types.iter().enumerate() {
        let result = insert_entry(
            &connection,
            &format!("t{index}"),
            entity_type,
            "created",
            None,
        );
        assert!(
            result.is_ok(),
            "entity type {entity_type} should be accepted"
        );
    }
    for (index, action) in actions.iter().enumerate() {
        let result = insert_entry(&connection, &format!("a{index}"), "task", action, None);
        assert!(result.is_ok(), "action {action} should be accepted");
    }
}

#[test]
fn rejects_unknown_entity_type_and_action() {
    let connection = migrated_connection();

    let unknown_type = insert_entry(&connection, "a1", "spaceship", "created", None);
    let unknown_action = insert_entry(&connection, "a2", "task", "exploded", None);

    assert!(unknown_type.is_err());
    assert!(unknown_action.is_err());
}

#[test]
fn rejects_null_and_empty_required_fields() {
    let connection = migrated_connection();

    let null_entity_id = connection.execute(
        "INSERT INTO activity_log (id, entity_type, entity_id, action, created_at) VALUES ('a1', 'task', NULL, 'created', ?1)",
        [NOW],
    );
    let empty_entity_id = connection.execute(
        "INSERT INTO activity_log (id, entity_type, entity_id, action, created_at) VALUES ('a2', 'task', '', 'created', ?1)",
        [NOW],
    );
    let null_created_at = connection.execute(
        "INSERT INTO activity_log (id, entity_type, entity_id, action, created_at) VALUES ('a3', 'task', 'e1', 'created', NULL)",
        [],
    );

    assert!(null_entity_id.is_err());
    assert!(empty_entity_id.is_err());
    assert!(null_created_at.is_err());
}

#[test]
fn history_survives_deletion_of_the_entity_it_describes() {
    let connection = migrated_connection();
    connection
        .execute(
            "INSERT INTO projects (id, name, created_at, updated_at) VALUES ('p1', 'Project', ?1, ?1)",
            [NOW],
        )
        .expect("project");
    connection
        .execute(
            "INSERT INTO activity_log (id, entity_type, entity_id, action, created_at) VALUES ('a1', 'project', 'p1', 'created', ?1)",
            [NOW],
        )
        .expect("entry");

    connection
        .execute("DELETE FROM projects WHERE id = 'p1'", [])
        .expect("deletes project");

    assert_eq!(count(&connection, "activity_log"), 1);
}

#[test]
fn entity_history_and_recent_feed_use_their_indexes() {
    let connection = migrated_connection();

    let history = query_plan(
        &connection,
        "SELECT id FROM activity_log WHERE entity_type = 'task' AND entity_id = 't1' ORDER BY created_at DESC",
    );
    let recent = query_plan(
        &connection,
        "SELECT id FROM activity_log ORDER BY created_at DESC LIMIT 20",
    );

    assert!(
        history.contains("idx_activity_log_entity_created"),
        "plan was: {history}"
    );
    assert!(
        recent.contains("idx_activity_log_created"),
        "plan was: {recent}"
    );
    assert!(!history.contains("TEMP B-TREE"), "plan was: {history}");
    assert!(!recent.contains("TEMP B-TREE"), "plan was: {recent}");
}
