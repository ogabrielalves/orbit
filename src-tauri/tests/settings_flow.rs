use orbit_lib::bootstrap::initialize_state;
use orbit_lib::error::AppError;
use orbit_lib::modules::settings::models::{Language, Settings, UpdateSettingsInput};
use orbit_lib::modules::settings::service;

#[test]
fn settings_survive_a_restart_on_a_real_database_file() {
    let directory = tempfile::tempdir().expect("creates temp dir");
    let first_run = initialize_state(directory.path()).expect("first start");
    let input = UpdateSettingsInput {
        language: Some(Language::PtBr),
        vault_path: Some("notes-vault".into()),
    };
    service::update(&first_run, input).expect("updates");
    drop(first_run);

    let second_run = initialize_state(directory.path()).expect("second start");

    let settings = service::get(&second_run).expect("reads");
    assert_eq!(settings.language, Language::PtBr);
    assert_eq!(settings.vault_path.as_deref(), Some("notes-vault"));
}

#[test]
fn fresh_database_starts_with_default_settings() {
    let directory = tempfile::tempdir().expect("creates temp dir");
    let state = initialize_state(directory.path()).expect("starts");

    let settings = service::get(&state).expect("reads");

    assert_eq!(settings, Settings::default());
}

#[test]
fn invalid_update_is_rejected_and_leaves_stored_settings_untouched() {
    let directory = tempfile::tempdir().expect("creates temp dir");
    let state = initialize_state(directory.path()).expect("starts");
    let input = UpdateSettingsInput {
        language: Some(Language::PtBr),
        vault_path: Some("  ".into()),
    };

    let result = service::update(&state, input);

    assert!(matches!(result, Err(AppError::Validation(_))));
    assert_eq!(service::get(&state).expect("reads"), Settings::default());
}
