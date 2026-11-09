use tauri::State;

use super::vault_service::{self, SetupVaultInput, VaultInfo, VaultStatus};
use crate::error::AppResult;
use crate::state::AppState;

#[tauri::command]
#[specta::specta]
pub async fn setup_vault(
    state: State<'_, AppState>,
    input: SetupVaultInput,
) -> AppResult<VaultInfo> {
    vault_service::setup(&state, input)
}

#[tauri::command]
#[specta::specta]
pub async fn get_vault_status(state: State<'_, AppState>) -> AppResult<VaultStatus> {
    Ok(vault_service::status(&state))
}
