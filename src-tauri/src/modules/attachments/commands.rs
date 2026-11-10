use tauri::{AppHandle, State};
use tauri_plugin_opener::OpenerExt;

use super::models::Attachment;
use super::service;
use crate::error::{AppError, AppResult};
use crate::state::AppState;

#[tauri::command]
#[specta::specta]
pub async fn import_attachment(
    state: State<'_, AppState>,
    task_id: String,
    source_path: String,
) -> AppResult<Attachment> {
    service::import(&state, &task_id, &source_path)
}

#[tauri::command]
#[specta::specta]
pub async fn list_attachments(
    state: State<'_, AppState>,
    task_id: String,
) -> AppResult<Vec<Attachment>> {
    service::list(&state, &task_id)
}

#[tauri::command]
#[specta::specta]
pub async fn remove_attachment(state: State<'_, AppState>, id: String) -> AppResult<()> {
    service::remove(&state, &id)
}

#[tauri::command]
#[specta::specta]
pub async fn open_attachment(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
) -> AppResult<()> {
    let path = service::path_for_open(&state, &id)?;
    app.opener()
        .open_path(path.to_string_lossy().into_owned(), None::<&str>)
        .map_err(|error| {
            log::error!("could not open attachment {id}: {error}");
            AppError::Io
        })
}
