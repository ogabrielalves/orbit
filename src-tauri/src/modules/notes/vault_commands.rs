use tauri::{AppHandle, State};

use super::index_service::IndexReport;
use super::vault_service::{self, SetupVaultInput, VaultInfo, VaultStatus};
use super::vault_watch;
use crate::error::AppResult;
use crate::state::AppState;

#[tauri::command]
#[specta::specta]
pub async fn setup_vault(
    app: AppHandle,
    state: State<'_, AppState>,
    input: SetupVaultInput,
) -> AppResult<VaultInfo> {
    let info = vault_service::setup(&state, input)?;
    vault_watch::restart(&app);
    Ok(info)
}

#[tauri::command]
#[specta::specta]
pub async fn get_vault_status(state: State<'_, AppState>) -> AppResult<VaultStatus> {
    Ok(vault_service::status(&state))
}

#[tauri::command]
#[specta::specta]
pub async fn reindex_vault(state: State<'_, AppState>) -> AppResult<IndexReport> {
    vault_service::reindex(&state)
}
