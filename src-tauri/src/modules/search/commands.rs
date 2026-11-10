use tauri::State;

use super::models::{SearchInput, SearchResults};
use super::service;
use crate::error::AppResult;
use crate::state::AppState;

/// Global search over projects, boards, tasks, notes and folders, grouped by category.
#[tauri::command]
#[specta::specta]
pub async fn search(state: State<'_, AppState>, input: SearchInput) -> AppResult<SearchResults> {
    service::search(&state, input)
}
