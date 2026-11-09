pub mod bootstrap;
pub mod db;
pub mod error;
pub mod modules;
pub mod shared;
pub mod state;

use std::error::Error;

use tauri::Manager;
use tauri_specta::{Builder, collect_commands};

use modules::activity::commands::{get_task_history, list_recent_activity};
use modules::attachments::commands::{
    import_attachment, list_attachments, open_attachment, remove_attachment,
};
use modules::backlog::commands::{list_backlog, list_backlog_by_project, move_backlog_task};
use modules::boards::commands::{
    create_board, create_column, delete_board, delete_column, get_board, move_column, update_board,
    update_column,
};
use modules::checklist::commands::{
    create_checklist_item, delete_checklist_item, list_checklist_items, move_checklist_item,
    update_checklist_item,
};
use modules::comments::commands::{create_comment, delete_comment, list_comments, update_comment};
use modules::dashboard::commands::get_dashboard_summary;
use modules::projects::commands::{
    archive_project, create_project, delete_project, get_project, list_projects, restore_project,
    update_project,
};
use modules::settings::commands::{get_settings, update_settings};
use modules::tags::commands::{
    assign_tag, create_tag, delete_tag, list_tags, list_task_tags, unassign_tag, update_tag,
};
use modules::tasks::commands::{
    archive_task, create_task, delete_task, get_task, list_board_tasks, move_task, restore_task,
    send_task_to_backlog, send_task_to_board, update_task,
};
use modules::tasks::duplicate_commands::duplicate_task;
use modules::tasks::subtask_commands::{
    create_subtask, list_subtasks, move_subtask, set_subtask_done,
};

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
            get_board,
            create_board,
            update_board,
            delete_board,
            create_column,
            update_column,
            move_column,
            delete_column,
            get_dashboard_summary,
            create_task,
            get_task,
            list_board_tasks,
            update_task,
            archive_task,
            restore_task,
            delete_task,
            move_task,
            send_task_to_board,
            send_task_to_backlog,
            create_subtask,
            list_subtasks,
            set_subtask_done,
            move_subtask,
            create_checklist_item,
            list_checklist_items,
            update_checklist_item,
            move_checklist_item,
            delete_checklist_item,
            create_comment,
            list_comments,
            update_comment,
            delete_comment,
            create_tag,
            list_tags,
            update_tag,
            delete_tag,
            list_task_tags,
            assign_tag,
            unassign_tag,
            duplicate_task,
            get_task_history,
            list_backlog,
            list_backlog_by_project,
            move_backlog_task,
            import_attachment,
            list_attachments,
            remove_attachment,
            open_attachment,
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
        .plugin(
            tauri_plugin_opener::Builder::new()
                .open_js_links_on_click(false)
                .build(),
        )
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
            "getBoard",
            "createBoard",
            "updateBoard",
            "deleteBoard",
            "createColumn",
            "updateColumn",
            "moveColumn",
            "deleteColumn",
            "getDashboardSummary",
            "createTask",
            "getTask",
            "listBoardTasks",
            "updateTask",
            "archiveTask",
            "restoreTask",
            "deleteTask",
            "moveTask",
            "sendTaskToBoard",
            "sendTaskToBacklog",
        ] {
            assert!(content.contains(command), "missing command {command}");
        }
        assert!(content.contains("code"));
        assert!(content.contains("vaultPath"));
    }
}
