use tauri::State;

use super::models::{Graph, GraphInput, LocalGraphInput};
use super::service;
use crate::error::AppResult;
use crate::state::AppState;

#[tauri::command]
#[specta::specta]
pub async fn get_graph(state: State<'_, AppState>, input: GraphInput) -> AppResult<Graph> {
    service::full(&state, input)
}

#[tauri::command]
#[specta::specta]
pub async fn get_local_graph(
    state: State<'_, AppState>,
    input: LocalGraphInput,
) -> AppResult<Graph> {
    service::local(&state, input)
}
