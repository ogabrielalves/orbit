use tauri::State;

use super::link_service;
use super::models::{NoteLinks, NoteSummary, UnresolvedLink};
use crate::error::AppResult;
use crate::state::AppState;

#[tauri::command]
#[specta::specta]
pub async fn resolve_note_link(
    state: State<'_, AppState>,
    target: String,
) -> AppResult<Option<NoteSummary>> {
    link_service::resolve(&state, &target)
}

#[tauri::command]
#[specta::specta]
pub async fn get_note_links(state: State<'_, AppState>, id: String) -> AppResult<NoteLinks> {
    link_service::for_note(&state, &id)
}

#[tauri::command]
#[specta::specta]
pub async fn list_unresolved_links(state: State<'_, AppState>) -> AppResult<Vec<UnresolvedLink>> {
    link_service::unresolved(&state)
}
