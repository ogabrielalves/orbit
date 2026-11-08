use tauri::State;

use super::models::{CreateTaskInput, Task, UpdateTaskInput};
use super::{placement_service, service};
use crate::error::AppResult;
use crate::state::AppState;

#[tauri::command]
#[specta::specta]
pub async fn create_task(state: State<'_, AppState>, input: CreateTaskInput) -> AppResult<Task> {
    service::create(&state, input)
}

#[tauri::command]
#[specta::specta]
pub async fn get_task(state: State<'_, AppState>, id: String) -> AppResult<Task> {
    service::get(&state, &id)
}

#[tauri::command]
#[specta::specta]
pub async fn list_board_tasks(
    state: State<'_, AppState>,
    board_id: String,
) -> AppResult<Vec<Task>> {
    service::list_by_board(&state, &board_id)
}

#[tauri::command]
#[specta::specta]
pub async fn update_task(
    state: State<'_, AppState>,
    id: String,
    input: UpdateTaskInput,
) -> AppResult<Task> {
    service::update(&state, &id, input)
}

#[tauri::command]
#[specta::specta]
pub async fn archive_task(state: State<'_, AppState>, id: String) -> AppResult<Task> {
    service::archive(&state, &id)
}

#[tauri::command]
#[specta::specta]
pub async fn restore_task(state: State<'_, AppState>, id: String) -> AppResult<Task> {
    service::restore(&state, &id)
}

#[tauri::command]
#[specta::specta]
pub async fn delete_task(state: State<'_, AppState>, id: String) -> AppResult<()> {
    service::delete(&state, &id)
}

#[tauri::command]
#[specta::specta]
pub async fn move_task(
    state: State<'_, AppState>,
    id: String,
    column_id: String,
    after_task_id: Option<String>,
) -> AppResult<Task> {
    placement_service::move_task(&state, &id, &column_id, after_task_id)
}

#[tauri::command]
#[specta::specta]
pub async fn send_task_to_board(
    state: State<'_, AppState>,
    id: String,
    board_id: String,
    column_id: Option<String>,
) -> AppResult<Task> {
    placement_service::send_to_board(&state, &id, &board_id, column_id)
}

#[tauri::command]
#[specta::specta]
pub async fn send_task_to_backlog(state: State<'_, AppState>, id: String) -> AppResult<Task> {
    placement_service::send_to_backlog(&state, &id)
}
