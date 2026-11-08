use tauri::State;

use super::models::ActivityEntry;
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
