use tauri::State;

use super::models::{
    CreateNoteInput, ListNotesInput, NoteDetails, NoteSummary, RenameNoteResult, SaveNoteInput,
};
use super::note_service;
use crate::error::AppResult;
use crate::state::AppState;

#[tauri::command]
#[specta::specta]
pub async fn list_notes(
    state: State<'_, AppState>,
    input: ListNotesInput,
) -> AppResult<Vec<NoteSummary>> {
    note_service::list(&state, input)
}

#[tauri::command]
#[specta::specta]
pub async fn get_note(state: State<'_, AppState>, id: String) -> AppResult<NoteDetails> {
    note_service::get(&state, &id)
}

#[tauri::command]
#[specta::specta]
pub async fn create_note(
    state: State<'_, AppState>,
    input: CreateNoteInput,
) -> AppResult<NoteDetails> {
    note_service::create(&state, input)
}

#[tauri::command]
#[specta::specta]
pub async fn save_note(
    state: State<'_, AppState>,
    id: String,
    input: SaveNoteInput,
) -> AppResult<NoteDetails> {
    note_service::save(&state, &id, input)
}

#[tauri::command]
#[specta::specta]
pub async fn rename_note(
    state: State<'_, AppState>,
    id: String,
    new_title: String,
) -> AppResult<RenameNoteResult> {
    note_service::rename(&state, &id, &new_title)
}

#[tauri::command]
#[specta::specta]
pub async fn move_note(
    state: State<'_, AppState>,
    id: String,
    new_folder_path: Option<String>,
) -> AppResult<NoteSummary> {
    note_service::move_note(&state, &id, new_folder_path.as_deref())
}

#[tauri::command]
#[specta::specta]
pub async fn delete_note(state: State<'_, AppState>, id: String) -> AppResult<()> {
    note_service::delete(&state, &id)
}
