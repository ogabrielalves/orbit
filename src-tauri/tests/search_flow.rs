#![allow(clippy::expect_used)]

use std::fs;

use orbit_lib::bootstrap::initialize_state;
use orbit_lib::modules::boards::models::{ColumnKind, CreateBoardInput, NewColumn};
use orbit_lib::modules::boards::service as boards;
use orbit_lib::modules::notes::models::CreateNoteInput;
use orbit_lib::modules::notes::note_service as notes;
use orbit_lib::modules::notes::vault_service::{SetupVaultInput, setup};
use orbit_lib::modules::projects::models::CreateProjectInput;
use orbit_lib::modules::projects::service as projects;
use orbit_lib::modules::search::models::SearchInput;
use orbit_lib::modules::search::service as search;
use orbit_lib::modules::tasks::models::CreateTaskInput;
use orbit_lib::modules::tasks::service as tasks;
use orbit_lib::state::AppState;

fn find(state: &AppState, query: &str) -> orbit_lib::modules::search::models::SearchResults {
    search::search(
        state,
        SearchInput {
            query: query.into(),
            limit_per_category: None,
        },
    )
    .expect("searches")
}

#[test]
fn everything_stays_searchable_across_restarts_and_outside_edits_are_picked_up() {
    let data = tempfile::tempdir().expect("data dir");
    let vault = tempfile::tempdir().expect("vault");
    let first_run = initialize_state(data.path()).expect("first start");
    setup(
        &first_run,
        SetupVaultInput {
            path: vault.path().to_string_lossy().into_owned(),
            create: true,
        },
    )
    .expect("sets up");
    let project = projects::create(
        &first_run,
        CreateProjectInput {
            name: "Compilador".into(),
            description: Some("analisador léxico".into()),
            icon: None,
            color: None,
        },
    )
    .expect("creates project");
    boards::create(
        &first_run,
        CreateBoardInput {
            project_id: project.id.clone(),
            name: "Sprint compilador".into(),
            columns: Some(vec![NewColumn::new("Todo", ColumnKind::Todo)]),
        },
    )
    .expect("creates board");
    tasks::create(
        &first_run,
        CreateTaskInput {
            project_id: project.id,
            title: "Implementar parser".into(),
            description: None,
            priority: None,
            due_date: None,
            column_id: None,
        },
    )
    .expect("creates task");
    notes::create(
        &first_run,
        CreateNoteInput {
            folder_path: None,
            title: "Gramática".into(),
            content: Some("# Gramática\nregras do compilador\n".into()),
            tags: None,
        },
    )
    .expect("creates note");
    fs::create_dir(vault.path().join("Compiladores")).expect("creates dir");
    drop(first_run);

    fs::write(
        vault.path().join("Externa.md"),
        "# Externa\ncompilador escrito fora do app\n",
    )
    .expect("writes");
    let second_run = initialize_state(data.path()).expect("second start");
    let results = find(&second_run, "COMPILADOR");

    assert_eq!(results.projects.len(), 1);
    assert_eq!(results.boards.len(), 1);
    assert_eq!(results.notes.len(), 2);
    assert_eq!(results.folders.len(), 1);
    assert_eq!(find(&second_run, "lexico").projects.len(), 1);
    assert_eq!(find(&second_run, "gramatica").notes.len(), 1);
    assert_eq!(find(&second_run, "parser").tasks.len(), 1);
}

#[test]
fn deleting_a_project_removes_it_and_everything_inside_it_from_the_results() {
    let data = tempfile::tempdir().expect("data dir");
    let state = initialize_state(data.path()).expect("starts");
    let project = projects::create(
        &state,
        CreateProjectInput {
            name: "Throwaway".into(),
            description: None,
            icon: None,
            color: None,
        },
    )
    .expect("creates project");
    tasks::create(
        &state,
        CreateTaskInput {
            project_id: project.id.clone(),
            title: "Throwaway task".into(),
            description: None,
            priority: None,
            due_date: None,
            column_id: None,
        },
    )
    .expect("creates task");
    assert_eq!(find(&state, "throwaway").total(), 2);

    projects::delete(&state, &project.id).expect("deletes");

    assert_eq!(find(&state, "throwaway").total(), 0);
}
