use tauri::State;

use super::models::{DashboardSummary, DashboardSummaryInput};
use super::recent_notes::{self, RecentNote, RecentNotesInput};
use super::service;
use crate::error::AppResult;
use crate::state::AppState;

#[tauri::command]
#[specta::specta]
pub async fn get_dashboard_summary(
    state: State<'_, AppState>,
    input: DashboardSummaryInput,
) -> AppResult<DashboardSummary> {
    service::summary(&state, input)
}

#[tauri::command]
#[specta::specta]
pub async fn list_recent_notes(
    state: State<'_, AppState>,
    input: RecentNotesInput,
) -> AppResult<Vec<RecentNote>> {
    recent_notes::list(&state, input)
}
