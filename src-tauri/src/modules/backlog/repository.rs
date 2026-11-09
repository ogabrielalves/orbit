use rusqlite::Connection;

use super::models::BacklogSort;
use crate::error::AppResult;
use crate::modules::tasks::models::Task;
use crate::modules::tasks::repository::map_task;

const TASK_SELECT: &str = "t.id, t.project_id, t.board_id, t.column_id, t.parent_task_id, t.title, \
     t.description, t.priority, t.due_date, t.position, t.created_at, t.updated_at, \
     t.completed_at, t.archived_at";

const PRIORITY_RANK: &str =
    "CASE t.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END";

pub struct BacklogFilter<'a> {
    pub project_id: Option<&'a str>,
    pub priority: Option<&'a str>,
    pub tag_id: Option<&'a str>,
    pub search_pattern: Option<&'a str>,
    pub sort: BacklogSort,
}

pub struct BacklogRow {
    pub task: Task,
    pub project_name: String,
    pub subtask_count: u32,
    pub subtasks_done: u32,
    pub checklist_count: u32,
    pub checklist_done: u32,
}

fn order_by(sort: BacklogSort) -> String {
    let by_project = "p.name COLLATE NOCASE, p.id, t.position, t.id";
    match sort {
        BacklogSort::Manual => by_project.to_string(),
        BacklogSort::Priority => {
            format!("{PRIORITY_RANK}, t.due_date IS NULL, t.due_date, {by_project}")
        }
        BacklogSort::DueDate => {
            format!("t.due_date IS NULL, t.due_date, {PRIORITY_RANK}, {by_project}")
        }
        BacklogSort::Created => "t.created_at DESC, t.id".to_string(),
        BacklogSort::Title => "t.title COLLATE NOCASE, t.id".to_string(),
    }
}

pub fn list(connection: &Connection, filter: &BacklogFilter<'_>) -> AppResult<Vec<BacklogRow>> {
    let sql = format!(
        "SELECT {TASK_SELECT}, p.name,
                (SELECT COUNT(*) FROM tasks s WHERE s.parent_task_id = t.id),
                (SELECT COUNT(*) FROM tasks s WHERE s.parent_task_id = t.id AND s.completed_at IS NOT NULL),
                (SELECT COUNT(*) FROM checklist_items c WHERE c.task_id = t.id),
                (SELECT COUNT(*) FROM checklist_items c WHERE c.task_id = t.id AND c.is_done = 1)
         FROM tasks t
         JOIN projects p ON p.id = t.project_id
         WHERE t.board_id IS NULL
           AND t.parent_task_id IS NULL
           AND t.archived_at IS NULL
           AND p.archived_at IS NULL
           AND (?1 IS NULL OR t.project_id = ?1)
           AND (?2 IS NULL OR t.priority = ?2)
           AND (?3 IS NULL OR EXISTS (
                SELECT 1 FROM task_tags tt WHERE tt.task_id = t.id AND tt.tag_id = ?3))
           AND (?4 IS NULL OR t.title LIKE ?4 ESCAPE '\\' OR t.description LIKE ?4 ESCAPE '\\')
         ORDER BY {}",
        order_by(filter.sort)
    );
    let mut statement = connection.prepare(&sql)?;
    let rows = statement.query_map(
        (
            filter.project_id,
            filter.priority,
            filter.tag_id,
            filter.search_pattern,
        ),
        |row| {
            Ok(BacklogRow {
                task: map_task(row)?,
                project_name: row.get(14)?,
                subtask_count: row.get(15)?,
                subtasks_done: row.get(16)?,
                checklist_count: row.get(17)?,
                checklist_done: row.get(18)?,
            })
        },
    )?;
    let items = rows.collect::<Result<Vec<_>, _>>()?;
    Ok(items)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{connection::open_in_memory, migrations};

    fn migrated_connection() -> Connection {
        let mut connection = open_in_memory().expect("opens");
        migrations::run(&mut connection).expect("migrates");
        connection
            .execute_batch(
                "INSERT INTO projects (id, name, created_at, updated_at) VALUES ('pa', 'Alpha', 'x', 'x');
                 INSERT INTO projects (id, name, created_at, updated_at) VALUES ('pb', 'beta', 'x', 'x');",
            )
            .expect("seeds");
        connection
    }

    fn insert_task(connection: &Connection, id: &str, project_id: &str, position: &str) {
        connection
            .execute(
                "INSERT INTO tasks (id, project_id, title, position, created_at, updated_at)
                 VALUES (?1, ?2, ?1, ?3, 'x', 'x')",
                (id, project_id, position),
            )
            .expect("task");
    }

    fn no_filter(sort: BacklogSort) -> BacklogFilter<'static> {
        BacklogFilter {
            project_id: None,
            priority: None,
            tag_id: None,
            search_pattern: None,
            sort,
        }
    }

    fn ids(rows: Vec<BacklogRow>) -> Vec<String> {
        rows.into_iter().map(|row| row.task.id).collect()
    }

    #[test]
    fn manual_order_is_project_name_ignoring_case_then_position() {
        let connection = migrated_connection();
        insert_task(&connection, "b2", "pb", "N");
        insert_task(&connection, "a2", "pa", "N");
        insert_task(&connection, "b1", "pb", "H");
        insert_task(&connection, "a1", "pa", "H");

        let rows = list(&connection, &no_filter(BacklogSort::Manual)).expect("lists");

        assert_eq!(ids(rows), ["a1", "a2", "b1", "b2"]);
    }

    #[test]
    fn only_loose_top_level_active_tasks_of_active_projects_are_listed() {
        let connection = migrated_connection();
        connection
            .execute_batch(
                "INSERT INTO projects (id, name, created_at, updated_at, archived_at) VALUES ('px', 'Gone', 'x', 'x', 'x');
                 INSERT INTO boards (id, project_id, name, created_at, updated_at) VALUES ('b', 'pa', 'B', 'x', 'x');
                 INSERT INTO columns (id, board_id, name, position, created_at, updated_at) VALUES ('c', 'b', 'C', 'V', 'x', 'x');",
            )
            .expect("seeds");
        insert_task(&connection, "loose", "pa", "V");
        insert_task(&connection, "archived", "pa", "W");
        insert_task(&connection, "child", "pa", "X");
        insert_task(&connection, "of-archived-project", "px", "V");
        insert_task(&connection, "on-board", "pa", "Y");
        connection
            .execute_batch(
                "UPDATE tasks SET archived_at = 'x' WHERE id = 'archived';
                 UPDATE tasks SET parent_task_id = 'loose' WHERE id = 'child';
                 UPDATE tasks SET board_id = 'b', column_id = 'c' WHERE id = 'on-board';",
            )
            .expect("updates");

        let rows = list(&connection, &no_filter(BacklogSort::Manual)).expect("lists");

        assert_eq!(ids(rows), ["loose"]);
    }

    #[test]
    fn counts_cover_subtasks_and_checklist_progress() {
        let connection = migrated_connection();
        insert_task(&connection, "t", "pa", "V");
        insert_task(&connection, "s1", "pa", "A");
        insert_task(&connection, "s2", "pa", "B");
        connection
            .execute_batch(
                "UPDATE tasks SET parent_task_id = 't' WHERE id IN ('s1', 's2');
                 UPDATE tasks SET completed_at = 'x' WHERE id = 's1';
                 INSERT INTO checklist_items (id, task_id, text, is_done, position, created_at, updated_at) VALUES ('i1', 't', 'a', 1, 'A', 'x', 'x');
                 INSERT INTO checklist_items (id, task_id, text, is_done, position, created_at, updated_at) VALUES ('i2', 't', 'b', 0, 'B', 'x', 'x');
                 INSERT INTO checklist_items (id, task_id, text, is_done, position, created_at, updated_at) VALUES ('i3', 't', 'c', 0, 'C', 'x', 'x');",
            )
            .expect("seeds");

        let rows = list(&connection, &no_filter(BacklogSort::Manual)).expect("lists");

        let row = &rows[0];
        assert_eq!(
            (
                row.subtask_count,
                row.subtasks_done,
                row.checklist_count,
                row.checklist_done
            ),
            (2, 1, 3, 1)
        );
        assert_eq!(row.project_name, "Alpha");
    }

    #[test]
    fn filters_combine_with_and() {
        let connection = migrated_connection();
        insert_task(&connection, "a-high", "pa", "A");
        insert_task(&connection, "a-low", "pa", "B");
        insert_task(&connection, "b-high", "pb", "A");
        connection
            .execute_batch(
                "UPDATE tasks SET priority = 'high' WHERE id IN ('a-high', 'b-high');
                 UPDATE tasks SET priority = 'low' WHERE id = 'a-low';",
            )
            .expect("updates");

        let both = BacklogFilter {
            project_id: Some("pa"),
            priority: Some("high"),
            ..no_filter(BacklogSort::Manual)
        };
        let only_project = BacklogFilter {
            project_id: Some("pa"),
            ..no_filter(BacklogSort::Manual)
        };

        assert_eq!(ids(list(&connection, &both).expect("lists")), ["a-high"]);
        assert_eq!(
            ids(list(&connection, &only_project).expect("lists")),
            ["a-high", "a-low"]
        );
    }

    #[test]
    fn the_listing_drives_from_the_backlog_index() {
        let connection = migrated_connection();

        let mut statement = connection
            .prepare(
                "EXPLAIN QUERY PLAN SELECT t.id FROM tasks t
                 WHERE t.board_id IS NULL AND t.parent_task_id IS NULL AND t.archived_at IS NULL",
            )
            .expect("prepares");
        let plan: Vec<String> = statement
            .query_map([], |row| row.get::<_, String>(3))
            .expect("runs")
            .collect::<Result<_, _>>()
            .expect("reads");

        assert!(
            plan.iter().any(|line| line.contains("idx_tasks_backlog")),
            "plan was: {plan:?}"
        );
    }
}
