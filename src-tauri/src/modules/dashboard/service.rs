use chrono::{Days, NaiveDate, Utc};

use super::models::{DashboardSummary, DashboardSummaryInput};
use super::repository;
use crate::error::{AppError, AppResult};
use crate::state::AppState;

pub const DEFAULT_UPCOMING_DAYS: u32 = 7;
pub const MAX_UPCOMING_DAYS: u32 = 90;
pub const DEFAULT_UPCOMING_LIMIT: u32 = 10;
pub const MAX_UPCOMING_LIMIT: u32 = 50;

const DATE_FORMAT: &str = "%Y-%m-%d";
const DATE_LENGTH: usize = 10;

pub fn summary(state: &AppState, input: DashboardSummaryInput) -> AppResult<DashboardSummary> {
    let today = resolve_today(input.today.as_deref())?;
    let days = input
        .upcoming_days
        .unwrap_or(DEFAULT_UPCOMING_DAYS)
        .clamp(1, MAX_UPCOMING_DAYS);
    let limit = input
        .upcoming_limit
        .unwrap_or(DEFAULT_UPCOMING_LIMIT)
        .clamp(1, MAX_UPCOMING_LIMIT);

    let day_after_window = today
        .checked_add_days(Days::new(u64::from(days) + 1))
        .ok_or_else(|| AppError::Validation("today is too far in the future".into()))?;
    let from_date = format_date(today);
    let until_date = format_date(day_after_window);

    let connection = state.database();
    Ok(DashboardSummary {
        tasks: repository::count_task_states(&connection)?,
        active_project_count: repository::count_active_projects(&connection)?,
        overdue_task_count: repository::count_overdue(&connection, &from_date)?,
        upcoming_tasks: repository::find_upcoming(&connection, &from_date, &until_date, limit)?,
    })
}

fn resolve_today(requested: Option<&str>) -> AppResult<NaiveDate> {
    let Some(text) = requested else {
        return Ok(Utc::now().date_naive());
    };
    let trimmed = text.trim();
    let has_expected_length = trimmed.len() == DATE_LENGTH;
    let parsed = NaiveDate::parse_from_str(trimmed, DATE_FORMAT).ok();
    match parsed {
        Some(date) if has_expected_length => Ok(date),
        _ => Err(AppError::Validation(
            "today must be a date in YYYY-MM-DD format".into(),
        )),
    }
}

fn format_date(date: NaiveDate) -> String {
    date.format(DATE_FORMAT).to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{connection::open_in_memory, migrations};
    use crate::modules::boards::models::{BoardDetails, CreateBoardInput};
    use crate::modules::boards::{column_service, service as boards};
    use crate::modules::tasks::models::TaskPriority;

    const NOW: &str = "2026-11-08T10:00:00.000Z";
    const TODAY: &str = "2026-11-08";

    fn state() -> AppState {
        let mut connection = open_in_memory().expect("opens");
        migrations::run(&mut connection).expect("migrates");
        AppState::new(connection, None)
    }

    fn execute(state: &AppState, sql: &str, params: &[&str]) {
        state
            .database()
            .execute(sql, rusqlite::params_from_iter(params))
            .expect("executes");
    }

    fn add_project(state: &AppState, id: &str) {
        execute(
            state,
            "INSERT INTO projects (id, name, created_at, updated_at) VALUES (?1, ?1, ?2, ?2)",
            &[id, NOW],
        );
    }

    fn add_board(state: &AppState, project_id: &str, columns: &[&str]) -> BoardDetails {
        boards::create(
            state,
            CreateBoardInput {
                project_id: project_id.into(),
                name: "Board".into(),
                column_names: Some(columns.iter().map(|name| name.to_string()).collect()),
            },
        )
        .expect("creates board")
    }

    fn add_task_on_board(
        state: &AppState,
        id: &str,
        project_id: &str,
        board: &BoardDetails,
        column_index: usize,
    ) {
        execute(
            state,
            "INSERT INTO tasks (id, project_id, board_id, column_id, title, position, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?1, 'V', ?5, ?5)",
            &[
                id,
                project_id,
                &board.board.id,
                &board.columns[column_index].id,
                NOW,
            ],
        );
    }

    fn add_backlog_task(state: &AppState, id: &str, project_id: &str) {
        execute(
            state,
            "INSERT INTO tasks (id, project_id, title, position, created_at, updated_at) VALUES (?1, ?2, ?1, 'V', ?3, ?3)",
            &[id, project_id, NOW],
        );
    }

    fn set_due(state: &AppState, id: &str, due_date: &str) {
        execute(
            state,
            "UPDATE tasks SET due_date = ?1 WHERE id = ?2",
            &[due_date, id],
        );
    }

    fn set_priority(state: &AppState, id: &str, priority: TaskPriority) {
        execute(
            state,
            "UPDATE tasks SET priority = ?1 WHERE id = ?2",
            &[priority.as_str(), id],
        );
    }

    fn input() -> DashboardSummaryInput {
        DashboardSummaryInput {
            today: Some(TODAY.into()),
            ..Default::default()
        }
    }

    fn summary_for_today(state: &AppState) -> DashboardSummary {
        summary(state, input()).expect("summarizes")
    }

    fn upcoming_ids(summary: &DashboardSummary) -> Vec<&str> {
        summary
            .upcoming_tasks
            .iter()
            .map(|task| task.task_id.as_str())
            .collect()
    }

    #[test]
    fn an_empty_database_summarizes_to_zeros() {
        let state = state();

        let result = summary_for_today(&state);

        assert_eq!(result.tasks.total, 0);
        assert_eq!(result.active_project_count, 0);
        assert_eq!(result.overdue_task_count, 0);
        assert!(result.upcoming_tasks.is_empty());
    }

    #[test]
    fn task_state_comes_from_the_column_position_on_a_five_column_board() {
        let state = state();
        add_project(&state, "p1");
        let board = add_board(
            &state,
            "p1",
            &["Backlog", "To Do", "Doing", "Review", "Done"],
        );
        add_task_on_board(&state, "first", "p1", &board, 0);
        add_task_on_board(&state, "second", "p1", &board, 1);
        add_task_on_board(&state, "third", "p1", &board, 2);
        add_task_on_board(&state, "fourth", "p1", &board, 3);
        add_task_on_board(&state, "last", "p1", &board, 4);
        add_task_on_board(&state, "last-too", "p1", &board, 4);

        let counts = summary_for_today(&state).tasks;

        assert_eq!(counts.pending, 1);
        assert_eq!(counts.in_progress, 3);
        assert_eq!(counts.completed, 2);
        assert_eq!(counts.backlog, 0);
        assert_eq!(counts.total, 6);
    }

    #[test]
    fn tasks_without_a_board_count_as_backlog_and_in_the_total() {
        let state = state();
        add_project(&state, "p1");
        let board = add_board(&state, "p1", &["Todo", "Done"]);
        add_backlog_task(&state, "idea-1", "p1");
        add_backlog_task(&state, "idea-2", "p1");
        add_task_on_board(&state, "on-board", "p1", &board, 0);

        let counts = summary_for_today(&state).tasks;

        assert_eq!(counts.backlog, 2);
        assert_eq!(counts.pending, 1);
        assert_eq!(counts.total, 3);
    }

    #[test]
    fn a_two_column_board_has_only_pending_and_completed() {
        let state = state();
        add_project(&state, "p1");
        let board = add_board(&state, "p1", &["Todo", "Done"]);
        add_task_on_board(&state, "a", "p1", &board, 0);
        add_task_on_board(&state, "b", "p1", &board, 1);

        let counts = summary_for_today(&state).tasks;

        assert_eq!(
            (counts.pending, counts.in_progress, counts.completed),
            (1, 0, 1)
        );
    }

    #[test]
    fn a_single_column_board_never_counts_as_completed() {
        let state = state();
        add_project(&state, "p1");
        let board = add_board(&state, "p1", &["Only"]);
        add_task_on_board(&state, "a", "p1", &board, 0);

        let counts = summary_for_today(&state).tasks;

        assert_eq!(
            (counts.pending, counts.in_progress, counts.completed),
            (1, 0, 0)
        );
    }

    #[test]
    fn adding_a_column_after_done_moves_the_completed_state_to_the_new_last_column() {
        let state = state();
        add_project(&state, "p1");
        let board = add_board(&state, "p1", &["Todo", "Done"]);
        add_task_on_board(&state, "in-done", "p1", &board, 1);
        column_service::create(
            &state,
            crate::modules::boards::models::CreateColumnInput {
                board_id: board.board.id.clone(),
                name: "Shipped".into(),
                color: None,
            },
        )
        .expect("adds column");

        let counts = summary_for_today(&state).tasks;

        assert_eq!((counts.in_progress, counts.completed), (1, 0));
    }

    #[test]
    fn reordering_columns_changes_which_tasks_are_completed() {
        let state = state();
        add_project(&state, "p1");
        let board = add_board(&state, "p1", &["A", "B", "C"]);
        add_task_on_board(&state, "in-c", "p1", &board, 2);
        column_service::move_column(&state, &board.columns[2].id, None).expect("moves C first");

        let counts = summary_for_today(&state).tasks;

        assert_eq!((counts.pending, counts.completed), (1, 0));
    }

    #[test]
    fn each_board_is_classified_by_its_own_columns() {
        let state = state();
        add_project(&state, "p1");
        let short = add_board(&state, "p1", &["Todo", "Done"]);
        let long = add_board(&state, "p1", &["A", "B", "C", "D"]);
        add_task_on_board(&state, "short-last", "p1", &short, 1);
        add_task_on_board(&state, "long-last", "p1", &long, 3);
        add_task_on_board(&state, "long-mid", "p1", &long, 1);

        let counts = summary_for_today(&state).tasks;

        assert_eq!(
            (counts.pending, counts.in_progress, counts.completed),
            (0, 1, 2)
        );
    }

    #[test]
    fn states_always_add_up_to_the_total() {
        let state = state();
        add_project(&state, "p1");
        add_project(&state, "p2");
        let one = add_board(&state, "p1", &["A", "B", "C"]);
        let two = add_board(&state, "p2", &["X", "Y"]);
        for (index, column) in [0usize, 1, 2, 2, 1, 0].into_iter().enumerate() {
            add_task_on_board(&state, &format!("one-{index}"), "p1", &one, column);
        }
        for (index, column) in [0usize, 1, 1].into_iter().enumerate() {
            add_task_on_board(&state, &format!("two-{index}"), "p2", &two, column);
        }
        add_backlog_task(&state, "idea", "p1");

        let counts = summary_for_today(&state).tasks;

        let sum = counts.backlog + counts.pending + counts.in_progress + counts.completed;
        assert_eq!(counts.total, sum);
        assert_eq!(counts.total, 10);
    }

    #[test]
    fn archived_tasks_subtasks_and_tasks_of_archived_projects_or_boards_are_left_out() {
        let state = state();
        add_project(&state, "live");
        add_project(&state, "gone");
        let live_board = add_board(&state, "live", &["Todo", "Done"]);
        let gone_board = add_board(&state, "gone", &["Todo", "Done"]);
        let archived_board = add_board(&state, "live", &["Todo", "Done"]);
        add_task_on_board(&state, "counted", "live", &live_board, 0);
        add_task_on_board(&state, "archived-task", "live", &live_board, 0);
        add_task_on_board(&state, "parent", "live", &live_board, 0);
        add_task_on_board(&state, "subtask", "live", &live_board, 0);
        add_task_on_board(&state, "in-gone-project", "gone", &gone_board, 0);
        add_task_on_board(&state, "in-archived-board", "live", &archived_board, 0);
        add_backlog_task(&state, "backlog-of-gone", "gone");
        execute(
            &state,
            "UPDATE tasks SET archived_at = ?1 WHERE id = 'archived-task'",
            &[NOW],
        );
        execute(
            &state,
            "UPDATE tasks SET parent_task_id = 'parent' WHERE id = 'subtask'",
            &[],
        );
        execute(
            &state,
            "UPDATE projects SET archived_at = ?1 WHERE id = 'gone'",
            &[NOW],
        );
        execute(
            &state,
            "UPDATE boards SET archived_at = ?1 WHERE id = ?2",
            &[NOW, &archived_board.board.id],
        );

        let counts = summary_for_today(&state).tasks;

        assert_eq!(counts.total, 2);
        assert_eq!(counts.pending, 2);
        assert_eq!(counts.backlog, 0);
    }

    #[test]
    fn active_projects_exclude_paused_completed_and_archived_ones() {
        let state = state();
        for id in ["active-1", "active-2", "paused", "completed", "archived"] {
            add_project(&state, id);
        }
        execute(
            &state,
            "UPDATE projects SET status = 'paused' WHERE id = 'paused'",
            &[],
        );
        execute(
            &state,
            "UPDATE projects SET status = 'completed' WHERE id = 'completed'",
            &[],
        );
        execute(
            &state,
            "UPDATE projects SET archived_at = ?1 WHERE id = 'archived'",
            &[NOW],
        );

        assert_eq!(summary_for_today(&state).active_project_count, 2);
    }

    #[test]
    fn upcoming_covers_today_through_the_last_day_of_the_window_inclusive() {
        let state = state();
        add_project(&state, "p1");
        for (id, due) in [
            ("yesterday", "2026-11-07"),
            ("today", "2026-11-08"),
            ("mid", "2026-11-12"),
            ("last-day", "2026-11-15"),
            ("after-window", "2026-11-16"),
        ] {
            add_backlog_task(&state, id, "p1");
            set_due(&state, id, due);
        }

        let result = summary_for_today(&state);

        assert_eq!(upcoming_ids(&result), ["today", "mid", "last-day"]);
    }

    #[test]
    fn upcoming_accepts_due_dates_stored_with_a_time_part() {
        let state = state();
        add_project(&state, "p1");
        for (id, due) in [
            ("today-evening", "2026-11-08T23:30:00.000Z"),
            ("last-day-late", "2026-11-15T23:59:59.000Z"),
            ("day-after", "2026-11-16T00:00:00.000Z"),
            ("yesterday-late", "2026-11-07T23:59:59.000Z"),
        ] {
            add_backlog_task(&state, id, "p1");
            set_due(&state, id, due);
        }

        let result = summary_for_today(&state);

        assert_eq!(upcoming_ids(&result), ["today-evening", "last-day-late"]);
    }

    #[test]
    fn upcoming_skips_completed_tasks_but_keeps_pending_ones_and_the_backlog() {
        let state = state();
        add_project(&state, "p1");
        let board = add_board(&state, "p1", &["Todo", "Doing", "Done"]);
        add_task_on_board(&state, "pending", "p1", &board, 0);
        add_task_on_board(&state, "doing", "p1", &board, 1);
        add_task_on_board(&state, "done", "p1", &board, 2);
        add_backlog_task(&state, "idea", "p1");
        for id in ["pending", "doing", "done", "idea"] {
            set_due(&state, id, "2026-11-09");
        }

        let result = summary_for_today(&state);

        let mut ids = upcoming_ids(&result);
        ids.sort_unstable();
        assert_eq!(ids, ["doing", "idea", "pending"]);
    }

    #[test]
    fn upcoming_skips_archived_tasks_subtasks_and_archived_projects() {
        let state = state();
        add_project(&state, "live");
        add_project(&state, "gone");
        for id in ["ok", "archived", "parent", "sub"] {
            add_backlog_task(&state, id, "live");
            set_due(&state, id, "2026-11-10");
        }
        add_backlog_task(&state, "of-gone", "gone");
        set_due(&state, "of-gone", "2026-11-10");
        execute(
            &state,
            "UPDATE tasks SET archived_at = ?1 WHERE id = 'archived'",
            &[NOW],
        );
        execute(
            &state,
            "UPDATE tasks SET parent_task_id = 'parent' WHERE id = 'sub'",
            &[],
        );
        execute(
            &state,
            "UPDATE projects SET archived_at = ?1 WHERE id = 'gone'",
            &[NOW],
        );

        let result = summary_for_today(&state);

        let mut ids = upcoming_ids(&result);
        ids.sort_unstable();
        assert_eq!(ids, ["ok", "parent"]);
    }

    #[test]
    fn upcoming_is_ordered_by_date_then_priority_then_title() {
        let state = state();
        add_project(&state, "p1");
        let specs = [
            ("late-urgent", "2026-11-12", TaskPriority::Urgent),
            ("early-low", "2026-11-09", TaskPriority::Low),
            ("early-urgent", "2026-11-09", TaskPriority::Urgent),
            ("early-high", "2026-11-09", TaskPriority::High),
            ("early-medium-b", "2026-11-09", TaskPriority::Medium),
            ("early-medium-a", "2026-11-09", TaskPriority::Medium),
        ];
        for (id, due, priority) in specs {
            add_backlog_task(&state, id, "p1");
            set_due(&state, id, due);
            set_priority(&state, id, priority);
        }

        let result = summary_for_today(&state);

        assert_eq!(
            upcoming_ids(&result),
            [
                "early-urgent",
                "early-high",
                "early-medium-a",
                "early-medium-b",
                "early-low",
                "late-urgent"
            ]
        );
    }

    #[test]
    fn upcoming_items_carry_project_board_and_column_context() {
        let state = state();
        add_project(&state, "p1");
        let board = add_board(&state, "p1", &["Todo", "Done"]);
        add_task_on_board(&state, "on-board", "p1", &board, 0);
        add_backlog_task(&state, "in-backlog", "p1");
        set_due(&state, "on-board", "2026-11-09");
        set_due(&state, "in-backlog", "2026-11-10");
        set_priority(&state, "in-backlog", TaskPriority::High);

        let result = summary_for_today(&state);

        let on_board = &result.upcoming_tasks[0];
        assert_eq!(on_board.project_name, "p1");
        assert_eq!(on_board.board_id.as_deref(), Some(board.board.id.as_str()));
        assert_eq!(
            on_board.column_id.as_deref(),
            Some(board.columns[0].id.as_str())
        );
        assert_eq!(on_board.priority, TaskPriority::Medium);
        let in_backlog = &result.upcoming_tasks[1];
        assert_eq!(
            (in_backlog.board_id.clone(), in_backlog.column_id.clone()),
            (None, None)
        );
        assert_eq!(in_backlog.priority, TaskPriority::High);
        assert_eq!(in_backlog.due_date, "2026-11-10");
    }

    #[test]
    fn upcoming_respects_the_custom_window_and_limit() {
        let state = state();
        add_project(&state, "p1");
        for (id, due) in [
            ("d1", "2026-11-09"),
            ("d2", "2026-11-10"),
            ("d3", "2026-11-11"),
            ("d20", "2026-11-28"),
        ] {
            add_backlog_task(&state, id, "p1");
            set_due(&state, id, due);
        }

        let narrow = summary(
            &state,
            DashboardSummaryInput {
                upcoming_days: Some(2),
                ..input()
            },
        )
        .expect("summarizes");
        let limited = summary(
            &state,
            DashboardSummaryInput {
                upcoming_limit: Some(2),
                ..input()
            },
        )
        .expect("summarizes");
        let wide = summary(
            &state,
            DashboardSummaryInput {
                upcoming_days: Some(30),
                ..input()
            },
        )
        .expect("summarizes");

        assert_eq!(upcoming_ids(&narrow), ["d1", "d2"]);
        assert_eq!(upcoming_ids(&limited), ["d1", "d2"]);
        assert_eq!(upcoming_ids(&wide), ["d1", "d2", "d3", "d20"]);
    }

    #[test]
    fn the_window_is_clamped_to_at_least_one_day_and_at_most_ninety() {
        let state = state();
        add_project(&state, "p1");
        for (id, due) in [
            ("today", "2026-12-01"),
            ("tomorrow", "2026-12-02"),
            ("day-two", "2026-12-03"),
            ("day-ninety", "2027-03-01"),
            ("day-ninety-one", "2027-03-02"),
        ] {
            add_backlog_task(&state, id, "p1");
            set_due(&state, id, due);
        }
        let from_december = |days: u32| DashboardSummaryInput {
            today: Some("2026-12-01".into()),
            upcoming_days: Some(days),
            upcoming_limit: Some(50),
        };

        let zero_days = summary(&state, from_december(0)).expect("summarizes");
        let huge = summary(&state, from_december(10_000)).expect("summarizes");

        assert_eq!(upcoming_ids(&zero_days), ["today", "tomorrow"]);
        assert_eq!(
            upcoming_ids(&huge),
            ["today", "tomorrow", "day-two", "day-ninety"]
        );
    }

    #[test]
    fn the_limit_is_clamped_to_at_least_one_and_at_most_fifty() {
        let state = state();
        add_project(&state, "p1");
        for index in 0..60 {
            let id = format!("t{index:02}");
            add_backlog_task(&state, &id, "p1");
            set_due(&state, &id, "2026-11-09");
        }

        let zero = summary(
            &state,
            DashboardSummaryInput {
                upcoming_limit: Some(0),
                ..input()
            },
        )
        .expect("summarizes");
        let huge = summary(
            &state,
            DashboardSummaryInput {
                upcoming_limit: Some(10_000),
                ..input()
            },
        )
        .expect("summarizes");

        assert_eq!(zero.upcoming_tasks.len(), 1);
        assert_eq!(huge.upcoming_tasks.len(), MAX_UPCOMING_LIMIT as usize);
    }

    #[test]
    fn default_window_is_a_week_and_default_limit_is_ten() {
        let state = state();
        add_project(&state, "p1");
        for index in 0..12 {
            let id = format!("t{index:02}");
            add_backlog_task(&state, &id, "p1");
            set_due(&state, &id, "2026-11-09");
        }
        add_backlog_task(&state, "eight-days-out", "p1");
        set_due(&state, "eight-days-out", "2026-11-16");

        let result = summary_for_today(&state);

        assert_eq!(result.upcoming_tasks.len(), DEFAULT_UPCOMING_LIMIT as usize);
        assert!(!upcoming_ids(&result).contains(&"eight-days-out"));
    }

    #[test]
    fn overdue_counts_unfinished_tasks_due_before_today() {
        let state = state();
        add_project(&state, "p1");
        let board = add_board(&state, "p1", &["Todo", "Done"]);
        add_task_on_board(&state, "late-pending", "p1", &board, 0);
        add_task_on_board(&state, "late-but-done", "p1", &board, 1);
        add_backlog_task(&state, "late-idea", "p1");
        add_backlog_task(&state, "due-today", "p1");
        add_backlog_task(&state, "no-date", "p1");
        add_backlog_task(&state, "late-archived", "p1");
        for id in [
            "late-pending",
            "late-but-done",
            "late-idea",
            "late-archived",
        ] {
            set_due(&state, id, "2026-11-01");
        }
        set_due(&state, "due-today", "2026-11-08");
        execute(
            &state,
            "UPDATE tasks SET archived_at = ?1 WHERE id = 'late-archived'",
            &[NOW],
        );

        let result = summary_for_today(&state);

        assert_eq!(result.overdue_task_count, 2);
        assert!(
            result
                .upcoming_tasks
                .iter()
                .all(|task| task.due_date.as_str() >= TODAY)
        );
    }

    #[test]
    fn today_defaults_to_the_current_utc_date() {
        let state = state();
        add_project(&state, "p1");
        let today = Utc::now().date_naive().format(DATE_FORMAT).to_string();
        add_backlog_task(&state, "due-now", "p1");
        set_due(&state, "due-now", &today);

        let result = summary(&state, DashboardSummaryInput::default()).expect("summarizes");

        assert_eq!(upcoming_ids(&result), ["due-now"]);
    }

    #[test]
    fn today_must_be_a_strict_iso_date() {
        let state = state();

        for invalid in [
            "",
            "tomorrow",
            "08/11/2026",
            "2026-13-01",
            "2026-1-5",
            "2026-11-08T10:00",
        ] {
            let result = summary(
                &state,
                DashboardSummaryInput {
                    today: Some(invalid.into()),
                    ..Default::default()
                },
            );
            assert!(
                matches!(result, Err(AppError::Validation(_))),
                "{invalid:?} should be rejected"
            );
        }
    }

    #[test]
    fn today_is_trimmed_before_parsing() {
        let state = state();

        let result = summary(
            &state,
            DashboardSummaryInput {
                today: Some("  2026-11-08 ".into()),
                ..Default::default()
            },
        );

        assert!(result.is_ok());
    }

    #[test]
    fn the_window_crosses_month_and_year_boundaries() {
        let state = state();
        add_project(&state, "p1");
        add_backlog_task(&state, "new-year", "p1");
        set_due(&state, "new-year", "2027-01-02");

        let result = summary(
            &state,
            DashboardSummaryInput {
                today: Some("2026-12-30".into()),
                upcoming_days: Some(5),
                ..Default::default()
            },
        )
        .expect("summarizes");

        assert_eq!(upcoming_ids(&result), ["new-year"]);
    }
}
