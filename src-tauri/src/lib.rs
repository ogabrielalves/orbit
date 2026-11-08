pub mod bootstrap;
pub mod db;
pub mod error;
pub mod modules;
pub mod shared;
pub mod state;

use std::error::Error;

use tauri::Manager;
use tauri_specta::{Builder, collect_commands};

use modules::activity::commands::list_recent_activity;
use modules::projects::commands::{
    archive_project, create_project, delete_project, get_project, list_projects, restore_project,
    update_project,
};
use modules::settings::commands::{get_settings, update_settings};

pub fn bindings_builder() -> Builder<tauri::Wry> {
    Builder::<tauri::Wry>::new()
        .disable_serde_phases()
        .commands(collect_commands![
            get_settings,
            update_settings,
            list_projects,
            get_project,
            create_project,
            update_project,
            archive_project,
            restore_project,
            delete_project,
            list_recent_activity,
        ])
}

#[cfg(debug_assertions)]
fn export_bindings(builder: &Builder<tauri::Wry>) {
    let result = builder.export(
        specta_typescript::Typescript::default(),
        "../src/bindings.ts",
    );
    if let Err(error) = result {
        log::error!("failed to export typescript bindings: {error}");
    }
}

pub fn run() -> tauri::Result<()> {
    let builder = bindings_builder();

    #[cfg(debug_assertions)]
    export_bindings(&builder);

    tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::new().build())
        .invoke_handler(builder.invoke_handler())
        .setup(move |app| {
            builder.mount_events(app);
            let data_directory = app.path().app_data_dir()?;
            let state = bootstrap::initialize_state(&data_directory)
                .map_err(|error| -> Box<dyn Error> { Box::new(error) })?;
            app.manage(state);
            Ok(())
        })
        .run(tauri::generate_context!())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn exported_bindings_contain_settings_commands_and_error_shape() {
        let directory = tempfile::tempdir().expect("temp dir");
        let target = directory.path().join("bindings.ts");

        bindings_builder()
            .export(specta_typescript::Typescript::default(), &target)
            .expect("exports");

        let content = std::fs::read_to_string(&target).expect("reads bindings");
        assert!(content.contains("getSettings"));
        assert!(content.contains("updateSettings"));
        for command in [
            "listProjects",
            "getProject",
            "createProject",
            "updateProject",
            "archiveProject",
            "restoreProject",
            "deleteProject",
            "listRecentActivity",
        ] {
            assert!(content.contains(command), "missing command {command}");
        }
        assert!(content.contains("code"));
        assert!(content.contains("vaultPath"));
    }
}
