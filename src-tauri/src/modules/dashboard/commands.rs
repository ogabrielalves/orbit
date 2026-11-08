use tauri::State;

use super::models::{DashboardSummary, DashboardSummaryInput};
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
