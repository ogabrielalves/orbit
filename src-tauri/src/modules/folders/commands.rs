use tauri::State;

use super::models::{CreateFolderInput, FolderEntry};
use super::service;
use crate::error::AppResult;
use crate::state::AppState;

#[tauri::command]
#[specta::specta]
pub async fn list_folders(state: State<'_, AppState>) -> AppResult<Vec<FolderEntry>> {
    service::list(&state)
}

#[tauri::command]
#[specta::specta]
pub async fn create_folder(
    state: State<'_, AppState>,
    input: CreateFolderInput,
) -> AppResult<FolderEntry> {
    service::create(&state, input)
}

#[tauri::command]
#[specta::specta]
pub async fn rename_folder(
    state: State<'_, AppState>,
    path: String,
    new_name: String,
) -> AppResult<FolderEntry> {
    service::rename(&state, &path, &new_name)
}

#[tauri::command]
#[specta::specta]
pub async fn move_folder(
    state: State<'_, AppState>,
    path: String,
    new_parent_path: Option<String>,
) -> AppResult<FolderEntry> {
    service::move_folder(&state, &path, new_parent_path.as_deref())
}

#[tauri::command]
#[specta::specta]
pub async fn delete_folder(
    state: State<'_, AppState>,
    path: String,
    recursive: bool,
) -> AppResult<()> {
    service::delete(&state, &path, recursive)
}
