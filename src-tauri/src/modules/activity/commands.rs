use tauri::State;

use super::models::{ActivityEntry, EntityType};
use super::service;
use crate::error::AppResult;
use crate::state::AppState;

#[tauri::command]
#[specta::specta]
pub async fn list_recent_activity(
    state: State<'_, AppState>,
    limit: Option<u32>,
) -> AppResult<Vec<ActivityEntry>> {
    service::recent(&state, limit)
}

#[tauri::command]
#[specta::specta]
pub async fn get_task_history(
    state: State<'_, AppState>,
    task_id: String,
    limit: Option<u32>,
) -> AppResult<Vec<ActivityEntry>> {
    service::history(&state, EntityType::Task, &task_id, limit)
}
