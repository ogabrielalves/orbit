use tauri::State;

use super::models::{SearchInput, SearchResults};
use super::service;
use crate::error::AppResult;
use crate::state::AppState;

#[tauri::command]
#[specta::specta]
pub async fn search(state: State<'_, AppState>, input: SearchInput) -> AppResult<SearchResults> {
    service::search(&state, input)
}
