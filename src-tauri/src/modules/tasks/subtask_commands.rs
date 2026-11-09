use tauri::State;

use super::models::{CreateSubtaskInput, Task};
use super::subtask_service;
use crate::error::AppResult;
use crate::state::AppState;

#[tauri::command]
#[specta::specta]
pub async fn create_subtask(
    state: State<'_, AppState>,
    input: CreateSubtaskInput,
) -> AppResult<Task> {
    subtask_service::create(&state, input)
}

#[tauri::command]
#[specta::specta]
pub async fn list_subtasks(
    state: State<'_, AppState>,
    parent_task_id: String,
) -> AppResult<Vec<Task>> {
    subtask_service::list(&state, &parent_task_id)
}

#[tauri::command]
#[specta::specta]
pub async fn set_subtask_done(
    state: State<'_, AppState>,
    id: String,
    is_done: bool,
) -> AppResult<Task> {
    subtask_service::set_done(&state, &id, is_done)
}

#[tauri::command]
#[specta::specta]
pub async fn move_subtask(
    state: State<'_, AppState>,
    id: String,
    after_subtask_id: Option<String>,
) -> AppResult<Task> {
    subtask_service::move_subtask(&state, &id, after_subtask_id)
}
