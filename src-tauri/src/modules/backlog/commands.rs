use tauri::State;

use super::models::{BacklogGroup, BacklogItem, ListBacklogInput};
use super::service;
use crate::error::AppResult;
use crate::modules::tasks::models::Task;
use crate::state::AppState;

#[tauri::command]
#[specta::specta]
pub async fn list_backlog(
    state: State<'_, AppState>,
    input: ListBacklogInput,
) -> AppResult<Vec<BacklogItem>> {
    service::list(&state, input)
}

#[tauri::command]
#[specta::specta]
pub async fn list_backlog_by_project(
    state: State<'_, AppState>,
    input: ListBacklogInput,
) -> AppResult<Vec<BacklogGroup>> {
    service::list_by_project(&state, input)
}

#[tauri::command]
#[specta::specta]
pub async fn move_backlog_task(
    state: State<'_, AppState>,
    id: String,
    after_task_id: Option<String>,
) -> AppResult<Task> {
    service::move_item(&state, &id, after_task_id)
}
