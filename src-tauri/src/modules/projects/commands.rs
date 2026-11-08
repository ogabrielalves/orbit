use tauri::State;

use super::models::{
    CreateProjectInput, ListProjectsInput, Project, ProjectDetails, UpdateProjectInput,
};
use super::service;
use crate::error::AppResult;
use crate::state::AppState;

#[tauri::command]
#[specta::specta]
pub async fn list_projects(
    state: State<'_, AppState>,
    input: ListProjectsInput,
) -> AppResult<Vec<Project>> {
    service::list(&state, input)
}

#[tauri::command]
#[specta::specta]
pub async fn get_project(state: State<'_, AppState>, id: String) -> AppResult<ProjectDetails> {
    service::get(&state, &id)
}

#[tauri::command]
#[specta::specta]
pub async fn create_project(
    state: State<'_, AppState>,
    input: CreateProjectInput,
) -> AppResult<Project> {
    service::create(&state, input)
}

#[tauri::command]
#[specta::specta]
pub async fn update_project(
    state: State<'_, AppState>,
    id: String,
    input: UpdateProjectInput,
) -> AppResult<Project> {
    service::update(&state, &id, input)
}

#[tauri::command]
#[specta::specta]
pub async fn archive_project(state: State<'_, AppState>, id: String) -> AppResult<Project> {
    service::archive(&state, &id)
}

#[tauri::command]
#[specta::specta]
pub async fn restore_project(state: State<'_, AppState>, id: String) -> AppResult<Project> {
    service::restore(&state, &id)
}

#[tauri::command]
#[specta::specta]
pub async fn delete_project(state: State<'_, AppState>, id: String) -> AppResult<()> {
    service::delete(&state, &id)
}
