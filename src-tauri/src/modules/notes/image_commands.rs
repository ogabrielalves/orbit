use tauri::State;

use super::image_service::{self, PasteImageInput, PastedImage, VaultImage};
use crate::error::AppResult;
use crate::state::AppState;

#[tauri::command]
#[specta::specta]
pub async fn save_pasted_image(
    state: State<'_, AppState>,
    input: PasteImageInput,
) -> AppResult<PastedImage> {
    image_service::save_pasted(&state, input)
}

#[tauri::command]
#[specta::specta]
pub async fn read_vault_image(state: State<'_, AppState>, path: String) -> AppResult<VaultImage> {
    image_service::read(&state, &path)
}
