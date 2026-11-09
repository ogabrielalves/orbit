use tauri::State;

use super::duplicate_service;
use super::models::Task;
use crate::error::AppResult;
use crate::state::AppState;

#[tauri::command]
#[specta::specta]
pub async fn duplicate_task(
    state: State<'_, AppState>,
    id: String,
    title: Option<String>,
) -> AppResult<Task> {
    duplicate_service::duplicate(&state, &id, title)
}
