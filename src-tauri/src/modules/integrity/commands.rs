use tauri::State;

use super::models::DatabaseStatus;
use super::service;
use crate::error::AppResult;
use crate::state::AppState;

#[tauri::command]
#[specta::specta]
pub async fn get_database_status(state: State<'_, AppState>) -> AppResult<DatabaseStatus> {
    Ok(service::status(&state))
}
