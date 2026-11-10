use tauri::State;

use super::models::{FavoriteEntry, FavoriteRef};
use super::service;
use crate::error::AppResult;
use crate::state::AppState;

/// Adds the item to the favorites or removes it. Returns whether it is a favorite afterwards.
#[tauri::command]
#[specta::specta]
pub async fn toggle_favorite(
    state: State<'_, AppState>,
    reference: FavoriteRef,
) -> AppResult<bool> {
    service::toggle(&state, reference)
}

#[tauri::command]
#[specta::specta]
pub async fn list_favorites(state: State<'_, AppState>) -> AppResult<Vec<FavoriteEntry>> {
    service::list(&state)
}

/// Moves a favorite right after `after_reference` (omitted puts it first).
#[tauri::command]
#[specta::specta]
pub async fn move_favorite(
    state: State<'_, AppState>,
    reference: FavoriteRef,
    after_reference: Option<FavoriteRef>,
) -> AppResult<()> {
    service::move_favorite(&state, reference, after_reference)
}
