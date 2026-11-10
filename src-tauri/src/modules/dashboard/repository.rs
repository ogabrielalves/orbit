use rusqlite::Connection;

use super::models::{TaskStateCounts, UpcomingTask};
use crate::error::{AppError, AppResult};
use crate::modules::tasks::models::TaskPriority;

const EVERY_TASK: &str = "";
const DUE_WITHIN_RANGE: &str = "AND t.due_date >= ?1 AND t.due_date < ?2";
const DUE_BEFORE_DATE: &str = "AND t.due_date < ?1";

fn scoped_tasks(task_filter: &str) -> String {
    format!(
        "WITH scoped_tasks AS (
    SELECT t.id, t.title, t.due_date, t.priority, t.project_id, t.board_id, t.column_id,
           p.name AS project_name,
           CASE
               WHEN t.board_id IS NULL THEN 'backlog'
               WHEN c.kind = 'done' THEN 'completed'
               WHEN c.kind = 'todo' THEN 'pending'
               ELSE 'in_progress'
           END AS state
    FROM tasks t
    CROSS JOIN projects p
    LEFT JOIN boards b ON b.id = t.board_id
    LEFT JOIN columns c ON c.id = t.column_id
    WHERE p.id = t.project_id
      AND t.archived_at IS NULL
      AND t.parent_task_id IS NULL
      AND p.archived_at IS NULL
      AND (t.board_id IS NULL OR b.archived_at IS NULL)
      {task_filter}
)"
    )
}

pub fn count_task_states(connection: &Connection) -> AppResult<TaskStateCounts> {
    let sql = format!(
        "{} SELECT state, COUNT(*) FROM scoped_tasks GROUP BY state",
        scoped_tasks(EVERY_TASK)
    );
    let mut statement = connection.prepare(&sql)?;
    let rows = statement.query_map([], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, u32>(1)?))
    })?;

    let mut counts = TaskStateCounts::default();
    for row in rows {
        let (state, count) = row?;
        match state.as_str() {
            "backlog" => counts.backlog = count,
            "pending" => counts.pending = count,
            "in_progress" => counts.in_progress = count,
            "completed" => counts.completed = count,
            other => {
                log::error!("unknown task state '{other}' in dashboard query");
                return Err(AppError::Internal);
            }
        }
        counts.total += count;
    }
    Ok(counts)
}

pub fn count_active_projects(connection: &Connection) -> AppResult<u32> {
    let count = connection.query_row(
        "SELECT COUNT(*) FROM projects WHERE archived_at IS NULL AND status = 'active'",
        [],
        |row| row.get(0),
    )?;
    Ok(count)
}

pub fn count_overdue(connection: &Connection, today: &str) -> AppResult<u32> {
    let sql = format!(
        "{} SELECT COUNT(*) FROM scoped_tasks WHERE state <> 'completed'",
        scoped_tasks(DUE_BEFORE_DATE)
    );
    let count = connection.query_row(&sql, [today], |row| row.get(0))?;
    Ok(count)
}

pub fn find_upcoming(
    connection: &Connection,
    from_date: &str,
    until_date_exclusive: &str,
    limit: u32,
) -> AppResult<Vec<UpcomingTask>> {
    let sql = format!(
        "{} SELECT id, title, due_date, priority, project_id, project_name, board_id, column_id
         FROM scoped_tasks
         WHERE state <> 'completed'
         ORDER BY due_date,
                  CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
                  title, id
         LIMIT ?3",
        scoped_tasks(DUE_WITHIN_RANGE)
    );
    let mut statement = connection.prepare(&sql)?;
    let rows = statement.query_map((from_date, until_date_exclusive, limit), |row| {
        let priority_text: String = row.get(3)?;
        let priority = TaskPriority::parse(&priority_text).ok_or_else(|| {
            rusqlite::Error::FromSqlConversionFailure(
                3,
                rusqlite::types::Type::Text,
                format!("unknown task priority '{priority_text}'").into(),
            )
        })?;
        Ok(UpcomingTask {
            task_id: row.get(0)?,
            title: row.get(1)?,
            due_date: row.get(2)?,
            priority,
            project_id: row.get(4)?,
            project_name: row.get(5)?,
            board_id: row.get(6)?,
            column_id: row.get(7)?,
        })
    })?;
    let tasks = rows.collect::<Result<Vec<_>, _>>()?;
    Ok(tasks)
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RecentNoteRow {
    pub id: String,
    pub title: String,
    pub path: String,
    pub created_at: String,
    pub modified_at: String,
    pub body_prefix: String,
}

pub fn find_recent_notes(connection: &Connection, limit: u32) -> AppResult<Vec<RecentNoteRow>> {
    let mut statement = connection.prepare(
        "SELECT n.id, n.title, n.path, n.created_at, n.modified_at,
                COALESCE((SELECT substr(s.body, 1, 1500)
                          FROM search_entries e JOIN search_index s ON s.rowid = e.id
                          WHERE e.entity_type = 'note' AND e.entity_id = n.id), '')
         FROM notes n
         ORDER BY n.modified_at DESC, n.path
         LIMIT ?1",
    )?;
    let rows = statement.query_map([limit], |row| {
        Ok(RecentNoteRow {
            id: row.get(0)?,
            title: row.get(1)?,
            path: row.get(2)?,
            created_at: row.get(3)?,
            modified_at: row.get(4)?,
            body_prefix: row.get(5)?,
        })
    })?;
    let notes = rows.collect::<Result<Vec<_>, _>>()?;
    Ok(notes)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{connection::open_in_memory, migrations};

    const NOW: &str = "2026-11-08T10:00:00.000Z";

    fn migrated_connection() -> Connection {
        let mut connection = open_in_memory().expect("opens");
        migrations::run(&mut connection).expect("migrates");
        connection
    }

    fn insert_project(connection: &Connection, id: &str, status: &str, is_archived: bool) {
        let archived_at = if is_archived { Some(NOW) } else { None };
        connection
            .execute(
                "INSERT INTO projects (id, name, status, created_at, updated_at, archived_at) VALUES (?1, ?1, ?2, ?3, ?3, ?4)",
                (id, status, NOW, archived_at),
            )
            .expect("project");
    }

    #[test]
    fn counts_are_zero_on_an_empty_database() {
        let connection = migrated_connection();

        assert_eq!(
            count_task_states(&connection).expect("counts"),
            TaskStateCounts::default()
        );
        assert_eq!(count_active_projects(&connection).expect("counts"), 0);
        assert_eq!(count_overdue(&connection, "2026-11-08").expect("counts"), 0);
        assert!(
            find_upcoming(&connection, "2026-11-08", "2026-11-15", 10)
                .expect("reads")
                .is_empty()
        );
    }

    #[test]
    fn only_non_archived_active_projects_count_as_active() {
        let connection = migrated_connection();
        insert_project(&connection, "active", "active", false);
        insert_project(&connection, "active-too", "active", false);
        insert_project(&connection, "paused", "paused", false);
        insert_project(&connection, "completed", "completed", false);
        insert_project(&connection, "archived", "active", true);

        assert_eq!(count_active_projects(&connection).expect("counts"), 2);
    }

    fn plan_of(connection: &Connection, sql: &str) -> Vec<String> {
        let mut statement = connection
            .prepare(&format!("EXPLAIN QUERY PLAN {sql}"))
            .expect("prepares");
        statement
            .query_map([], |row| row.get::<_, String>(3))
            .expect("runs")
            .collect::<Result<_, _>>()
            .expect("reads")
    }

    #[test]
    fn upcoming_and_overdue_queries_drive_from_the_due_date_index() {
        let connection = migrated_connection();
        let upcoming = format!(
            "{} SELECT id FROM scoped_tasks WHERE state <> 'completed'",
            scoped_tasks(
                &DUE_WITHIN_RANGE
                    .replace("?1", "'2026-11-08'")
                    .replace("?2", "'2026-11-15'")
            )
        );
        let overdue = format!(
            "{} SELECT id FROM scoped_tasks WHERE state <> 'completed'",
            scoped_tasks(&DUE_BEFORE_DATE.replace("?1", "'2026-11-08'"))
        );

        let upcoming_plan = plan_of(&connection, &upcoming);
        let overdue_plan = plan_of(&connection, &overdue);

        assert!(
            upcoming_plan
                .iter()
                .any(|line| line.contains("idx_tasks_due_date")),
            "plan was: {upcoming_plan:?}"
        );
        assert!(
            overdue_plan
                .iter()
                .any(|line| line.contains("idx_tasks_due_date")),
            "plan was: {overdue_plan:?}"
        );
    }
}
