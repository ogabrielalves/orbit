use tauri::State;

use super::models::{
    Board, BoardColumn, BoardDetails, CreateBoardInput, CreateColumnInput, UpdateBoardInput,
    UpdateColumnInput,
};
use super::{column_service, service};
use crate::error::AppResult;
use crate::state::AppState;

#[tauri::command]
#[specta::specta]
pub async fn get_board(state: State<'_, AppState>, id: String) -> AppResult<BoardDetails> {
    service::get(&state, &id)
}

#[tauri::command]
#[specta::specta]
pub async fn create_board(
    state: State<'_, AppState>,
    input: CreateBoardInput,
) -> AppResult<BoardDetails> {
    service::create(&state, input)
}

#[tauri::command]
#[specta::specta]
pub async fn update_board(
    state: State<'_, AppState>,
    id: String,
    input: UpdateBoardInput,
) -> AppResult<Board> {
    service::update(&state, &id, input)
}

#[tauri::command]
#[specta::specta]
pub async fn delete_board(state: State<'_, AppState>, id: String) -> AppResult<()> {
    service::delete(&state, &id)
}

#[tauri::command]
#[specta::specta]
pub async fn create_column(
    state: State<'_, AppState>,
    input: CreateColumnInput,
) -> AppResult<BoardColumn> {
    column_service::create(&state, input)
}

#[tauri::command]
#[specta::specta]
pub async fn update_column(
    state: State<'_, AppState>,
    id: String,
    input: UpdateColumnInput,
) -> AppResult<BoardColumn> {
    column_service::update(&state, &id, input)
}

#[tauri::command]
#[specta::specta]
pub async fn move_column(
    state: State<'_, AppState>,
    id: String,
    after_column_id: Option<String>,
) -> AppResult<BoardColumn> {
    column_service::move_column(&state, &id, after_column_id)
}

#[tauri::command]
#[specta::specta]
pub async fn delete_column(state: State<'_, AppState>, id: String) -> AppResult<()> {
    column_service::delete(&state, &id)
}
