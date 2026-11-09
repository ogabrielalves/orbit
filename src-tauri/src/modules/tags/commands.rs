use tauri::State;

use super::models::{CreateTagInput, Tag, UpdateTagInput};
use super::service;
use crate::error::AppResult;
use crate::state::AppState;

#[tauri::command]
#[specta::specta]
pub async fn create_tag(state: State<'_, AppState>, input: CreateTagInput) -> AppResult<Tag> {
    service::create(&state, input)
}

#[tauri::command]
#[specta::specta]
pub async fn list_tags(state: State<'_, AppState>) -> AppResult<Vec<Tag>> {
    service::list(&state)
}

#[tauri::command]
#[specta::specta]
pub async fn update_tag(
    state: State<'_, AppState>,
    id: String,
    input: UpdateTagInput,
) -> AppResult<Tag> {
    service::update(&state, &id, input)
}

#[tauri::command]
#[specta::specta]
pub async fn delete_tag(state: State<'_, AppState>, id: String) -> AppResult<()> {
    service::delete(&state, &id)
}

#[tauri::command]
#[specta::specta]
pub async fn list_task_tags(state: State<'_, AppState>, task_id: String) -> AppResult<Vec<Tag>> {
    service::list_for_task(&state, &task_id)
}

#[tauri::command]
#[specta::specta]
pub async fn assign_tag(
    state: State<'_, AppState>,
    task_id: String,
    tag_id: String,
) -> AppResult<()> {
    service::assign(&state, &task_id, &tag_id)
}

#[tauri::command]
#[specta::specta]
pub async fn unassign_tag(
    state: State<'_, AppState>,
    task_id: String,
    tag_id: String,
) -> AppResult<()> {
    service::unassign(&state, &task_id, &tag_id)
}
