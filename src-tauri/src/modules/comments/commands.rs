use tauri::State;

use super::models::{Comment, CreateCommentInput};
use super::service;
use crate::error::AppResult;
use crate::state::AppState;

#[tauri::command]
#[specta::specta]
pub async fn create_comment(
    state: State<'_, AppState>,
    input: CreateCommentInput,
) -> AppResult<Comment> {
    service::create(&state, input)
}

#[tauri::command]
#[specta::specta]
pub async fn list_comments(state: State<'_, AppState>, task_id: String) -> AppResult<Vec<Comment>> {
    service::list(&state, &task_id)
}

#[tauri::command]
#[specta::specta]
pub async fn update_comment(
    state: State<'_, AppState>,
    id: String,
    body: String,
) -> AppResult<Comment> {
    service::update(&state, &id, &body)
}

#[tauri::command]
#[specta::specta]
pub async fn delete_comment(state: State<'_, AppState>, id: String) -> AppResult<()> {
    service::delete(&state, &id)
}
