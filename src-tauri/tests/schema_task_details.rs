mod common;

use common::{NOW, connection_with_task, count, query_plan};
use rusqlite::Connection;

fn insert_checklist_item(
    connection: &Connection,
    id: &str,
    task_id: &str,
    text: &str,
    position: &str,
) -> rusqlite::Result<usize> {
    connection.execute(
        "INSERT INTO checklist_items (id, task_id, text, position, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?5)",
        (id, task_id, text, position, NOW),
    )
}

fn insert_comment(
    connection: &Connection,
    id: &str,
    task_id: &str,
    body: &str,
) -> rusqlite::Result<usize> {
    connection.execute(
        "INSERT INTO comments (id, task_id, body, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?4)",
        (id, task_id, body, NOW),
    )
}

fn insert_tag(connection: &Connection, id: &str, name: &str) -> rusqlite::Result<usize> {
    connection.execute(
        "INSERT INTO tags (id, name, created_at, updated_at) VALUES (?1, ?2, ?3, ?3)",
        (id, name, NOW),
    )
}

fn insert_attachment(
    connection: &Connection,
    id: &str,
    task_id: &str,
    stored_name: &str,
    size_bytes: i64,
) -> rusqlite::Result<usize> {
    connection.execute(
        "INSERT INTO attachments (id, task_id, file_name, stored_name, mime_type, size_bytes, created_at) VALUES (?1, ?2, 'report.pdf', ?3, 'application/pdf', ?4, ?5)",
        (id, task_id, stored_name, size_bytes, NOW),
    )
}

#[test]
fn checklist_item_defaults_to_not_done() {
    let connection = connection_with_task();

    insert_checklist_item(&connection, "i1", "t1", "Write tests", "V").expect("inserts");

    let is_done: i64 = connection
        .query_row(
            "SELECT is_done FROM checklist_items WHERE id = 'i1'",
            [],
            |row| row.get(0),
        )
        .expect("reads");
    assert_eq!(is_done, 0);
}

#[test]
fn checklist_item_validates_task_text_flag_and_position() {
    let connection = connection_with_task();

    let missing_task = insert_checklist_item(&connection, "i1", "missing", "Text", "V");
    let blank_text = insert_checklist_item(&connection, "i2", "t1", "  ", "V");
    let invalid_position = insert_checklist_item(&connection, "i3", "t1", "Text", "V0");
    let invalid_flag = connection.execute(
        "INSERT INTO checklist_items (id, task_id, text, is_done, position, created_at, updated_at) VALUES ('i4', 't1', 'Text', 2, 'V', ?1, ?1)",
        [NOW],
    );
    let null_task = connection.execute(
        "INSERT INTO checklist_items (id, task_id, text, position, created_at, updated_at) VALUES ('i5', NULL, 'Text', 'V', ?1, ?1)",
        [NOW],
    );

    assert!(missing_task.is_err());
    assert!(blank_text.is_err());
    assert!(invalid_position.is_err());
    assert!(invalid_flag.is_err());
    assert!(null_task.is_err());
}

#[test]
fn deleting_a_task_deletes_checklist_items_comments_attachments_and_tag_links() {
    let connection = connection_with_task();
    insert_checklist_item(&connection, "i1", "t1", "Text", "V").expect("item");
    insert_comment(&connection, "c1", "t1", "Hello").expect("comment");
    insert_attachment(&connection, "a1", "t1", "stored-1", 10).expect("attachment");
    insert_tag(&connection, "g1", "urgent").expect("tag");
    connection
        .execute(
            "INSERT INTO task_tags (task_id, tag_id) VALUES ('t1', 'g1')",
            [],
        )
        .expect("link");

    connection
        .execute("DELETE FROM tasks WHERE id = 't1'", [])
        .expect("deletes task");

    assert_eq!(count(&connection, "checklist_items"), 0);
    assert_eq!(count(&connection, "comments"), 0);
    assert_eq!(count(&connection, "attachments"), 0);
    assert_eq!(count(&connection, "task_tags"), 0);
    assert_eq!(count(&connection, "tags"), 1);
}

#[test]
fn comment_validates_task_and_body() {
    let connection = connection_with_task();

    let missing_task = insert_comment(&connection, "c1", "missing", "Hello");
    let blank_body = insert_comment(&connection, "c2", "t1", "   ");
    let valid = insert_comment(&connection, "c3", "t1", "Hello");

    assert!(missing_task.is_err());
    assert!(blank_body.is_err());
    assert!(valid.is_ok());
}

#[test]
fn tag_names_are_unique_ignoring_case() {
    let connection = connection_with_task();
    insert_tag(&connection, "g1", "Backend").expect("first tag");

    let same_case = insert_tag(&connection, "g2", "Backend");
    let other_case = insert_tag(&connection, "g3", "backend");
    let other_name = insert_tag(&connection, "g4", "Frontend");

    assert!(same_case.is_err());
    assert!(other_case.is_err());
    assert!(other_name.is_ok());
}

#[test]
fn tag_rejects_blank_name() {
    let connection = connection_with_task();

    let result = insert_tag(&connection, "g1", "  ");

    assert!(result.is_err());
}

#[test]
fn task_tag_link_requires_existing_task_and_tag() {
    let connection = connection_with_task();
    insert_tag(&connection, "g1", "urgent").expect("tag");

    let missing_task = connection.execute(
        "INSERT INTO task_tags (task_id, tag_id) VALUES ('missing', 'g1')",
        [],
    );
    let missing_tag = connection.execute(
        "INSERT INTO task_tags (task_id, tag_id) VALUES ('t1', 'missing')",
        [],
    );

    assert!(missing_task.is_err());
    assert!(missing_tag.is_err());
}

#[test]
fn task_tag_link_cannot_be_duplicated() {
    let connection = connection_with_task();
    insert_tag(&connection, "g1", "urgent").expect("tag");
    connection
        .execute(
            "INSERT INTO task_tags (task_id, tag_id) VALUES ('t1', 'g1')",
            [],
        )
        .expect("first link");

    let duplicate = connection.execute(
        "INSERT INTO task_tags (task_id, tag_id) VALUES ('t1', 'g1')",
        [],
    );

    assert!(duplicate.is_err());
}

#[test]
fn deleting_a_tag_removes_links_but_keeps_tasks() {
    let connection = connection_with_task();
    insert_tag(&connection, "g1", "urgent").expect("tag");
    connection
        .execute(
            "INSERT INTO task_tags (task_id, tag_id) VALUES ('t1', 'g1')",
            [],
        )
        .expect("link");

    connection
        .execute("DELETE FROM tags WHERE id = 'g1'", [])
        .expect("deletes tag");

    assert_eq!(count(&connection, "task_tags"), 0);
    assert_eq!(count(&connection, "tasks"), 1);
}

#[test]
fn attachment_validates_required_fields_and_size() {
    let connection = connection_with_task();

    let missing_task = insert_attachment(&connection, "a1", "missing", "stored-1", 10);
    let negative_size = insert_attachment(&connection, "a2", "t1", "stored-2", -1);
    let empty_file_is_allowed = insert_attachment(&connection, "a3", "t1", "stored-3", 0);
    let blank_name = connection.execute(
        "INSERT INTO attachments (id, task_id, file_name, stored_name, mime_type, size_bytes, created_at) VALUES ('a4', 't1', ' ', 'stored-4', 'text/plain', 1, ?1)",
        [NOW],
    );
    let null_mime = connection.execute(
        "INSERT INTO attachments (id, task_id, file_name, stored_name, mime_type, size_bytes, created_at) VALUES ('a5', 't1', 'a.txt', 'stored-5', NULL, 1, ?1)",
        [NOW],
    );

    assert!(missing_task.is_err());
    assert!(negative_size.is_err());
    assert!(empty_file_is_allowed.is_ok());
    assert!(blank_name.is_err());
    assert!(null_mime.is_err());
}

#[test]
fn attachment_stored_names_are_unique() {
    let connection = connection_with_task();
    insert_attachment(&connection, "a1", "t1", "stored-1", 10).expect("first");

    let duplicate = insert_attachment(&connection, "a2", "t1", "stored-1", 10);

    assert!(duplicate.is_err());
}

#[test]
fn child_listings_use_their_task_indexes() {
    let connection = connection_with_task();

    let checklist = query_plan(
        &connection,
        "SELECT id FROM checklist_items WHERE task_id = 't1' ORDER BY position",
    );
    let comments = query_plan(
        &connection,
        "SELECT id FROM comments WHERE task_id = 't1' ORDER BY created_at",
    );
    let attachments = query_plan(
        &connection,
        "SELECT id FROM attachments WHERE task_id = 't1' ORDER BY created_at",
    );

    assert!(
        checklist.contains("idx_checklist_items_task_position"),
        "plan was: {checklist}"
    );
    assert!(
        comments.contains("idx_comments_task_created"),
        "plan was: {comments}"
    );
    assert!(
        attachments.contains("idx_attachments_task_created"),
        "plan was: {attachments}"
    );
    assert!(!checklist.contains("TEMP B-TREE"), "plan was: {checklist}");
    assert!(!comments.contains("TEMP B-TREE"), "plan was: {comments}");
    assert!(
        !attachments.contains("TEMP B-TREE"),
        "plan was: {attachments}"
    );
}

#[test]
fn filtering_tasks_by_tag_uses_the_tag_index() {
    let connection = connection_with_task();

    let plan = query_plan(
        &connection,
        "SELECT task_id FROM task_tags WHERE tag_id = 'g1'",
    );

    assert!(
        plan.contains("idx_task_tags_tag_task") || plan.contains("USING COVERING INDEX"),
        "plan was: {plan}"
    );
}
