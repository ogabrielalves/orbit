use orbit_lib::bootstrap::initialize_state;
use orbit_lib::error::AppError;
use orbit_lib::modules::settings::models::{Language, Settings, UpdateSettingsInput};
use orbit_lib::modules::settings::service;

#[test]
fn settings_survive_a_restart_on_a_real_database_file() {
    let directory = tempfile::tempdir().expect("creates temp dir");
    let first_run = initialize_state(directory.path()).expect("first start");
    let input = UpdateSettingsInput {
        language: Some(Some(Language::PtBr)),
        vault_path: Some("notes-vault".into()),
        ..Default::default()
    };
    service::save(&first_run, input).expect("updates");
    drop(first_run);

    let second_run = initialize_state(directory.path()).expect("second start");

    let settings = service::get(&second_run).expect("reads");
    assert_eq!(settings.language, Some(Language::PtBr));
    assert_eq!(settings.vault_path.as_deref(), Some("notes-vault"));
}

#[test]
fn the_user_name_survives_a_restart_and_can_be_cleared() {
    let directory = tempfile::tempdir().expect("creates temp dir");
    let first_run = initialize_state(directory.path()).expect("first start");
    let set = UpdateSettingsInput {
        user_name: Some(Some("  Ana  ".into())),
        ..Default::default()
    };
    service::update(&first_run, set).expect("sets the name");
    drop(first_run);

    let second_run = initialize_state(directory.path()).expect("second start");
    assert_eq!(
        service::get(&second_run)
            .expect("reads")
            .user_name
            .as_deref(),
        Some("Ana")
    );
    let clear = UpdateSettingsInput {
        user_name: Some(None),
        ..Default::default()
    };
    service::update(&second_run, clear).expect("clears the name");
    drop(second_run);

    let third_run = initialize_state(directory.path()).expect("third start");
    assert_eq!(service::get(&third_run).expect("reads").user_name, None);
}

#[test]
fn an_over_long_user_name_is_rejected_and_the_stored_one_survives_a_restart() {
    let directory = tempfile::tempdir().expect("creates temp dir");
    let first_run = initialize_state(directory.path()).expect("first start");
    let set = UpdateSettingsInput {
        user_name: Some(Some("Ana".into())),
        ..Default::default()
    };
    service::update(&first_run, set).expect("sets the name");
    let too_long = UpdateSettingsInput {
        user_name: Some(Some("a".repeat(61))),
        ..Default::default()
    };

    let result = service::update(&first_run, too_long);
    drop(first_run);

    assert!(matches!(result, Err(AppError::Validation(_))));
    let second_run = initialize_state(directory.path()).expect("second start");
    assert_eq!(
        service::get(&second_run)
            .expect("reads")
            .user_name
            .as_deref(),
        Some("Ana")
    );
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
        language: Some(Some(Language::PtBr)),
        vault_path: Some("  ".into()),
        ..Default::default()
    };

    let result = service::save(&state, input);

    assert!(matches!(result, Err(AppError::Validation(_))));
    assert_eq!(service::get(&state).expect("reads"), Settings::default());
}

#[test]
fn clearing_the_language_survives_a_restart() {
    let directory = tempfile::tempdir().expect("creates temp dir");
    let first_run = initialize_state(directory.path()).expect("first start");
    let choose = UpdateSettingsInput {
        language: Some(Some(Language::En)),
        ..Default::default()
    };
    service::update(&first_run, choose).expect("chooses");
    let clear = UpdateSettingsInput {
        language: Some(None),
        ..Default::default()
    };
    service::update(&first_run, clear).expect("clears");
    drop(first_run);

    let second_run = initialize_state(directory.path()).expect("second start");

    assert_eq!(service::get(&second_run).expect("reads").language, None);
}
