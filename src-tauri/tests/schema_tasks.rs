mod common;

use common::{
    NOW, connection_with_project, count, insert_board, insert_column, insert_project,
    migrated_connection, project_with_board_and_column, query_plan,
};
use rusqlite::Connection;

fn insert_backlog_task(
    connection: &Connection,
    id: &str,
    position: &str,
) -> rusqlite::Result<usize> {
    connection.execute(
        "INSERT INTO tasks (id, project_id, title, position, created_at, updated_at) VALUES (?1, 'p1', 'Task', ?2, ?3, ?3)",
        (id, position, NOW),
    )
}

fn insert_board_task(
    connection: &Connection,
    id: &str,
    board_id: Option<&str>,
    column_id: Option<&str>,
) -> rusqlite::Result<usize> {
    connection.execute(
        "INSERT INTO tasks (id, project_id, board_id, column_id, title, position, created_at, updated_at) VALUES (?1, 'p1', ?2, ?3, 'Task', 'V', ?4, ?4)",
        (id, board_id, column_id, NOW),
    )
}

#[test]
fn backlog_task_has_no_board_and_no_column_and_gets_defaults() {
    let connection = connection_with_project();

    insert_backlog_task(&connection, "t1", "V").expect("inserts");

    let (board_id, column_id, priority, description, due_date): (
        Option<String>,
        Option<String>,
        String,
        String,
        Option<String>,
    ) = connection
        .query_row(
            "SELECT board_id, column_id, priority, description, due_date FROM tasks WHERE id = 't1'",
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
    assert_eq!((board_id, column_id, due_date), (None, None, None));
    assert_eq!(priority, "medium");
    assert_eq!(description, "");
}

#[test]
fn task_on_a_board_needs_both_board_and_column() {
    let connection = migrated_connection();
    project_with_board_and_column(&connection);

    let both = insert_board_task(&connection, "t1", Some("b1"), Some("c1"));
    let column_only = insert_board_task(&connection, "t2", None, Some("c1"));
    let board_only = insert_board_task(&connection, "t3", Some("b1"), None);

    assert!(both.is_ok());
    assert!(column_only.is_err());
    assert!(board_only.is_err());
}

#[test]
fn column_must_belong_to_the_task_board() {
    let connection = migrated_connection();
    project_with_board_and_column(&connection);
    insert_board(&connection, "b2", "p1").expect("second board");
    insert_column(&connection, "c2", "b2", "V").expect("column of second board");

    let mismatch = insert_board_task(&connection, "t1", Some("b1"), Some("c2"));

    assert!(mismatch.is_err());
}

#[test]
fn board_must_belong_to_the_task_project() {
    let connection = migrated_connection();
    project_with_board_and_column(&connection);
    insert_project(&connection, "p2").expect("second project");

    let result = connection.execute(
        "INSERT INTO tasks (id, project_id, board_id, column_id, title, position, created_at, updated_at) VALUES ('t1', 'p2', 'b1', 'c1', 'Task', 'V', ?1, ?1)",
        [NOW],
    );

    assert!(result.is_err());
}

#[test]
fn task_requires_an_existing_project() {
    let connection = migrated_connection();

    let result = connection.execute(
        "INSERT INTO tasks (id, project_id, title, position, created_at, updated_at) VALUES ('t1', 'missing', 'Task', 'V', ?1, ?1)",
        [NOW],
    );

    assert!(result.is_err());
}

#[test]
fn rejects_blank_title_and_null_required_fields() {
    let connection = connection_with_project();

    let blank_title = connection.execute(
        "INSERT INTO tasks (id, project_id, title, position, created_at, updated_at) VALUES ('t1', 'p1', '  ', 'V', ?1, ?1)",
        [NOW],
    );
    let null_title = connection.execute(
        "INSERT INTO tasks (id, project_id, title, position, created_at, updated_at) VALUES ('t2', 'p1', NULL, 'V', ?1, ?1)",
        [NOW],
    );
    let null_position = connection.execute(
        "INSERT INTO tasks (id, project_id, title, position, created_at, updated_at) VALUES ('t3', 'p1', 'Task', NULL, ?1, ?1)",
        [NOW],
    );
    let null_project = connection.execute(
        "INSERT INTO tasks (id, project_id, title, position, created_at, updated_at) VALUES ('t4', NULL, 'Task', 'V', ?1, ?1)",
        [NOW],
    );

    assert!(blank_title.is_err());
    assert!(null_title.is_err());
    assert!(null_position.is_err());
    assert!(null_project.is_err());
}

#[test]
fn priority_accepts_only_known_levels() {
    let connection = connection_with_project();

    for (index, priority) in ["low", "medium", "high", "urgent"].iter().enumerate() {
        let result = connection.execute(
            "INSERT INTO tasks (id, project_id, title, priority, position, created_at, updated_at) VALUES (?1, 'p1', 'Task', ?2, 'V', ?3, ?3)",
            (format!("ok{index}"), priority, NOW),
        );
        assert!(result.is_ok(), "priority {priority} should be accepted");
    }
    let unknown = connection.execute(
        "INSERT INTO tasks (id, project_id, title, priority, position, created_at, updated_at) VALUES ('bad', 'p1', 'Task', 'critical', 'V', ?1, ?1)",
        [NOW],
    );
    assert!(unknown.is_err());
}

#[test]
fn due_date_must_start_with_an_iso_date() {
    let connection = connection_with_project();

    let valid = ["2026-11-08", "2026-11-08T10:00:00.000Z"];
    let invalid = ["08/11/2026", "tomorrow", ""];

    for (index, due_date) in valid.iter().enumerate() {
        let result = connection.execute(
            "INSERT INTO tasks (id, project_id, title, due_date, position, created_at, updated_at) VALUES (?1, 'p1', 'Task', ?2, 'V', ?3, ?3)",
            (format!("ok{index}"), due_date, NOW),
        );
        assert!(result.is_ok(), "due date {due_date:?} should be accepted");
    }
    for (index, due_date) in invalid.iter().enumerate() {
        let result = connection.execute(
            "INSERT INTO tasks (id, project_id, title, due_date, position, created_at, updated_at) VALUES (?1, 'p1', 'Task', ?2, 'V', ?3, ?3)",
            (format!("bad{index}"), due_date, NOW),
        );
        assert!(result.is_err(), "due date {due_date:?} should be rejected");
    }
}

#[test]
fn position_must_be_a_valid_fractional_index() {
    let connection = connection_with_project();

    assert!(insert_backlog_task(&connection, "t1", "V").is_ok());
    assert!(insert_backlog_task(&connection, "t2", "aV3").is_ok());
    assert!(insert_backlog_task(&connection, "t3", "").is_err());
    assert!(insert_backlog_task(&connection, "t4", "V0").is_err());
    assert!(insert_backlog_task(&connection, "t5", "a-b").is_err());
}

#[test]
fn equal_positions_are_allowed_across_tasks() {
    let connection = connection_with_project();

    assert!(insert_backlog_task(&connection, "t1", "V").is_ok());
    assert!(insert_backlog_task(&connection, "t2", "V").is_ok());
}

#[test]
fn subtask_requires_an_existing_parent() {
    let connection = connection_with_project();

    let result = connection.execute(
        "INSERT INTO tasks (id, project_id, parent_task_id, title, position, created_at, updated_at) VALUES ('s1', 'p1', 'missing', 'Sub', 'V', ?1, ?1)",
        [NOW],
    );

    assert!(result.is_err());
}

#[test]
fn task_cannot_be_its_own_parent() {
    let connection = connection_with_project();
    insert_backlog_task(&connection, "t1", "V").expect("task");

    let result = connection.execute("UPDATE tasks SET parent_task_id = 't1' WHERE id = 't1'", []);

    assert!(result.is_err());
}

#[test]
fn deleting_a_parent_task_deletes_its_subtasks() {
    let connection = connection_with_project();
    insert_backlog_task(&connection, "t1", "V").expect("parent");
    connection
        .execute(
            "INSERT INTO tasks (id, project_id, parent_task_id, title, position, created_at, updated_at) VALUES ('s1', 'p1', 't1', 'Sub', 'V', ?1, ?1)",
            [NOW],
        )
        .expect("subtask");

    connection
        .execute("DELETE FROM tasks WHERE id = 't1'", [])
        .expect("deletes parent");

    assert_eq!(count(&connection, "tasks"), 0);
}

#[test]
fn deleting_a_project_deletes_all_its_tasks_including_board_tasks() {
    let connection = migrated_connection();
    project_with_board_and_column(&connection);
    insert_board_task(&connection, "t1", Some("b1"), Some("c1")).expect("board task");
    insert_backlog_task(&connection, "t2", "V").expect("backlog task");

    let result = connection.execute("DELETE FROM projects WHERE id = 'p1'", []);

    assert!(result.is_ok());
    assert_eq!(count(&connection, "tasks"), 0);
    assert_eq!(count(&connection, "columns"), 0);
}

#[test]
fn cannot_delete_a_column_that_still_has_tasks() {
    let connection = migrated_connection();
    project_with_board_and_column(&connection);
    insert_board_task(&connection, "t1", Some("b1"), Some("c1")).expect("task");

    let result = connection.execute("DELETE FROM columns WHERE id = 'c1'", []);

    assert!(result.is_err());
    assert_eq!(count(&connection, "columns"), 1);
}

#[test]
fn cannot_delete_a_board_that_still_has_tasks() {
    let connection = migrated_connection();
    project_with_board_and_column(&connection);
    insert_board_task(&connection, "t1", Some("b1"), Some("c1")).expect("task");

    let result = connection.execute("DELETE FROM boards WHERE id = 'b1'", []);

    assert!(result.is_err());
}

#[test]
fn column_can_be_deleted_after_its_tasks_move_to_the_backlog() {
    let connection = migrated_connection();
    project_with_board_and_column(&connection);
    insert_board_task(&connection, "t1", Some("b1"), Some("c1")).expect("task");

    connection
        .execute(
            "UPDATE tasks SET board_id = NULL, column_id = NULL WHERE id = 't1'",
            [],
        )
        .expect("sends back to backlog");
    let result = connection.execute("DELETE FROM columns WHERE id = 'c1'", []);

    assert!(result.is_ok());
    assert_eq!(count(&connection, "tasks"), 1);
}

#[test]
fn kanban_column_listing_uses_the_board_column_position_index() {
    let connection = migrated_connection();

    let plan = query_plan(
        &connection,
        "SELECT id FROM tasks WHERE board_id = 'b1' AND column_id = 'c1' ORDER BY position",
    );

    assert!(
        plan.contains("idx_tasks_board_column_position"),
        "plan was: {plan}"
    );
    assert!(!plan.contains("TEMP B-TREE"), "plan was: {plan}");
}

#[test]
fn column_foreign_key_lookup_uses_the_column_index() {
    let connection = migrated_connection();

    let plan = query_plan(&connection, "SELECT id FROM tasks WHERE column_id = 'c1'");

    assert!(
        plan.contains("idx_tasks_column_position"),
        "plan was: {plan}"
    );
}

#[test]
fn project_listing_uses_the_project_index() {
    let connection = migrated_connection();

    let plan = query_plan(
        &connection,
        "SELECT id FROM tasks WHERE project_id = 'p1' AND archived_at IS NULL ORDER BY updated_at DESC",
    );

    assert!(
        plan.contains("idx_tasks_project_archived_updated"),
        "plan was: {plan}"
    );
}

#[test]
fn subtask_listing_uses_the_parent_index() {
    let connection = migrated_connection();

    let plan = query_plan(
        &connection,
        "SELECT id FROM tasks WHERE parent_task_id = 't1' ORDER BY position",
    );

    assert!(
        plan.contains("idx_tasks_parent_position"),
        "plan was: {plan}"
    );
}

#[test]
fn backlog_listing_uses_the_partial_backlog_indexes() {
    let connection = migrated_connection();

    let global_plan = query_plan(
        &connection,
        "SELECT id FROM tasks WHERE board_id IS NULL AND parent_task_id IS NULL AND archived_at IS NULL ORDER BY position",
    );
    let project_plan = query_plan(
        &connection,
        "SELECT id FROM tasks WHERE project_id = 'p1' AND board_id IS NULL AND parent_task_id IS NULL AND archived_at IS NULL ORDER BY position",
    );

    assert!(
        global_plan.contains("idx_tasks_backlog_position"),
        "plan was: {global_plan}"
    );
    assert!(
        project_plan.contains("idx_tasks_backlog_project_position"),
        "plan was: {project_plan}"
    );
}

#[test]
fn upcoming_due_dates_use_the_due_date_index() {
    let connection = migrated_connection();

    let plan = query_plan(
        &connection,
        "SELECT id FROM tasks WHERE due_date IS NOT NULL AND archived_at IS NULL AND due_date >= '2026-11-08' ORDER BY due_date",
    );

    assert!(plan.contains("idx_tasks_due_date"), "plan was: {plan}");
}
