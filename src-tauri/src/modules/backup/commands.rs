use tauri::{AppHandle, State};

use super::models::{BackupFile, ExportBackupInput, ImportBackupInput, ImportReport};
use super::service;
use crate::error::AppResult;
use crate::modules::notes::vault_watch;
use crate::state::AppState;

#[tauri::command]
#[specta::specta]
pub async fn export_database(
    state: State<'_, AppState>,
    input: ExportBackupInput,
) -> AppResult<BackupFile> {
    service::export(&state, input)
}

#[tauri::command]
#[specta::specta]
pub async fn import_database(
    app: AppHandle,
    state: State<'_, AppState>,
    input: ImportBackupInput,
) -> AppResult<ImportReport> {
    let report = service::import(&state, input)?;
    vault_watch::restart(&app);
    Ok(report)
}
