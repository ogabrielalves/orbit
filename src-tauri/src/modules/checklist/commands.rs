use tauri::State;

use super::models::{ChecklistItem, CreateChecklistItemInput, UpdateChecklistItemInput};
use super::service;
use crate::error::AppResult;
use crate::state::AppState;

#[tauri::command]
#[specta::specta]
pub async fn create_checklist_item(
    state: State<'_, AppState>,
    input: CreateChecklistItemInput,
) -> AppResult<ChecklistItem> {
    service::create(&state, input)
}

#[tauri::command]
#[specta::specta]
pub async fn list_checklist_items(
    state: State<'_, AppState>,
    task_id: String,
) -> AppResult<Vec<ChecklistItem>> {
    service::list(&state, &task_id)
}

#[tauri::command]
#[specta::specta]
pub async fn update_checklist_item(
    state: State<'_, AppState>,
    id: String,
    input: UpdateChecklistItemInput,
) -> AppResult<ChecklistItem> {
    service::update(&state, &id, input)
}

#[tauri::command]
#[specta::specta]
pub async fn move_checklist_item(
    state: State<'_, AppState>,
    id: String,
    after_item_id: Option<String>,
) -> AppResult<ChecklistItem> {
    service::move_item(&state, &id, after_item_id)
}

#[tauri::command]
#[specta::specta]
pub async fn delete_checklist_item(state: State<'_, AppState>, id: String) -> AppResult<()> {
    service::delete(&state, &id)
}
