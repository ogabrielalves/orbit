#![allow(clippy::expect_used)]

use orbit_lib::bootstrap::initialize_state;
use orbit_lib::modules::notes::vault_service::{SetupVaultInput, setup, status, vault_root};
use orbit_lib::modules::settings::service as settings;

#[test]
fn the_vault_choice_survives_a_restart() {
    let data = tempfile::tempdir().expect("data dir");
    let workspace = tempfile::tempdir().expect("workspace");
    let vault = workspace.path().join("My Vault");
    let first_run = initialize_state(data.path()).expect("first start");
    setup(
        &first_run,
        SetupVaultInput {
            path: vault.to_string_lossy().into_owned(),
            create: true,
        },
    )
    .expect("sets up");
    drop(first_run);

    let second_run = initialize_state(data.path()).expect("second start");

    assert_eq!(vault_root(&second_run).expect("resolves"), vault);
    let current = status(&second_run);
    assert!(current.is_accessible);
    assert_eq!(
        settings::get(&second_run)
            .expect("reads")
            .vault_path
            .as_deref(),
        Some(vault.to_string_lossy().as_ref())
    );
}

#[test]
fn a_vault_removed_between_runs_is_reported_as_inaccessible() {
    let data = tempfile::tempdir().expect("data dir");
    let workspace = tempfile::tempdir().expect("workspace");
    let vault = workspace.path().join("vault");
    let first_run = initialize_state(data.path()).expect("first start");
    setup(
        &first_run,
        SetupVaultInput {
            path: vault.to_string_lossy().into_owned(),
            create: true,
        },
    )
    .expect("sets up");
    drop(first_run);
    std::fs::remove_dir_all(&vault).expect("removes vault");

    let second_run = initialize_state(data.path()).expect("second start");
    let current = status(&second_run);

    assert!(!current.is_accessible);
    assert!(current.path.is_some());
    assert!(vault_root(&second_run).is_err());
}
