use rusqlite::{Connection, OptionalExtension};

use super::models::FavoriteType;
use crate::error::AppResult;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StoredFavorite {
    pub entity_type: String,
    pub entity_id: String,
    pub position: String,
    pub created_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct Resolved {
    pub title: String,
    pub context: Option<String>,
    pub project_id: Option<String>,
    pub board_id: Option<String>,
    pub parent_task_id: Option<String>,
    pub path: Option<String>,
    pub is_archived: bool,
}

pub fn insert(
    connection: &Connection,
    entity_type: &str,
    entity_id: &str,
    position: &str,
    created_at: &str,
) -> AppResult<()> {
    connection.execute(
        "INSERT INTO favorites (entity_type, entity_id, position, created_at) VALUES (?1, ?2, ?3, ?4)",
        (entity_type, entity_id, position, created_at),
    )?;
    Ok(())
}

pub fn delete(connection: &Connection, entity_type: &str, entity_id: &str) -> AppResult<usize> {
    let affected = connection.execute(
        "DELETE FROM favorites WHERE entity_type = ?1 AND entity_id = ?2",
        (entity_type, entity_id),
    )?;
    Ok(affected)
}

pub fn is_favorite(connection: &Connection, entity_type: &str, entity_id: &str) -> AppResult<bool> {
    let exists = connection.query_row(
        "SELECT EXISTS(SELECT 1 FROM favorites WHERE entity_type = ?1 AND entity_id = ?2)",
        (entity_type, entity_id),
        |row| row.get(0),
    )?;
    Ok(exists)
}

pub fn list(connection: &Connection) -> AppResult<Vec<StoredFavorite>> {
    let mut statement = connection.prepare(
        "SELECT entity_type, entity_id, position, created_at FROM favorites ORDER BY position",
    )?;
    let rows = statement.query_map([], |row| {
        Ok(StoredFavorite {
            entity_type: row.get(0)?,
            entity_id: row.get(1)?,
            position: row.get(2)?,
            created_at: row.get(3)?,
        })
    })?;
    let favorites = rows.collect::<Result<Vec<_>, _>>()?;
    Ok(favorites)
}

pub fn last_position(connection: &Connection) -> AppResult<Option<String>> {
    let position = connection
        .query_row(
            "SELECT position FROM favorites ORDER BY position DESC LIMIT 1",
            [],
            |row| row.get(0),
        )
        .optional()?;
    Ok(position)
}

pub fn set_position(
    connection: &Connection,
    entity_type: &str,
    entity_id: &str,
    position: &str,
) -> AppResult<usize> {
    let affected = connection.execute(
        "UPDATE favorites SET position = ?3 WHERE entity_type = ?1 AND entity_id = ?2",
        (entity_type, entity_id, position),
    )?;
    Ok(affected)
}

pub fn entity_exists(
    connection: &Connection,
    entity_type: FavoriteType,
    entity_id: &str,
) -> AppResult<bool> {
    let sql = match entity_type {
        FavoriteType::Project => "SELECT EXISTS(SELECT 1 FROM projects WHERE id = ?1)",
        FavoriteType::Board => "SELECT EXISTS(SELECT 1 FROM boards WHERE id = ?1)",
        FavoriteType::Task => "SELECT EXISTS(SELECT 1 FROM tasks WHERE id = ?1)",
        FavoriteType::Note => "SELECT EXISTS(SELECT 1 FROM notes WHERE id = ?1)",
        FavoriteType::Folder => return Ok(false),
    };
    let exists = connection.query_row(sql, [entity_id], |row| row.get(0))?;
    Ok(exists)
}

pub fn resolve(
    connection: &Connection,
    entity_type: FavoriteType,
    entity_id: &str,
) -> AppResult<Option<Resolved>> {
    let resolved = match entity_type {
        FavoriteType::Project => connection
            .query_row(
                "SELECT name, archived_at IS NOT NULL FROM projects WHERE id = ?1",
                [entity_id],
                |row| {
                    Ok(Resolved {
                        title: row.get(0)?,
                        is_archived: row.get(1)?,
                        ..Resolved::default()
                    })
                },
            )
            .optional()?,
        FavoriteType::Board => connection
            .query_row(
                "SELECT b.name, p.name, b.project_id, b.archived_at IS NOT NULL OR p.archived_at IS NOT NULL
                 FROM boards b JOIN projects p ON p.id = b.project_id WHERE b.id = ?1",
                [entity_id],
                |row| {
                    Ok(Resolved {
                        title: row.get(0)?,
                        context: row.get(1)?,
                        project_id: row.get(2)?,
                        board_id: Some(entity_id.to_string()),
                        is_archived: row.get(3)?,
                        ..Resolved::default()
                    })
                },
            )
            .optional()?,
        FavoriteType::Task => connection
            .query_row(
                "SELECT t.title, p.name, t.project_id, t.board_id, t.parent_task_id,
                        t.archived_at IS NOT NULL OR p.archived_at IS NOT NULL
                          OR COALESCE(b.archived_at IS NOT NULL, 0)
                          OR COALESCE(parent.archived_at IS NOT NULL, 0)
                 FROM tasks t
                 JOIN projects p ON p.id = t.project_id
                 LEFT JOIN boards b ON b.id = t.board_id
                 LEFT JOIN tasks parent ON parent.id = t.parent_task_id
                 WHERE t.id = ?1",
                [entity_id],
                |row| {
                    Ok(Resolved {
                        title: row.get(0)?,
                        context: row.get(1)?,
                        project_id: row.get(2)?,
                        board_id: row.get(3)?,
                        parent_task_id: row.get(4)?,
                        is_archived: row.get(5)?,
                        ..Resolved::default()
                    })
                },
            )
            .optional()?,
        FavoriteType::Note => connection
            .query_row(
                "SELECT title, path FROM notes WHERE id = ?1",
                [entity_id],
                |row| {
                    let path: String = row.get(1)?;
                    let folder = path.rsplit_once('/').map(|(folder, _)| folder.to_string());
                    Ok(Resolved {
                        title: row.get(0)?,
                        context: folder,
                        path: Some(path),
                        ..Resolved::default()
                    })
                },
            )
            .optional()?,
        FavoriteType::Folder => None,
    };
    Ok(resolved)
}

pub fn rename_folder(connection: &Connection, old_path: &str, new_path: &str) -> AppResult<usize> {
    let lower = format!("{old_path}/");
    let upper = format!("{old_path}0");
    let first_kept_character = i64::try_from(old_path.chars().count() + 1).unwrap_or(i64::MAX);
    let affected = connection.execute(
        "UPDATE favorites SET entity_id = ?3 || substr(entity_id, ?4)
         WHERE entity_type = 'folder'
           AND (entity_id = ?1 OR (entity_id >= ?2 AND entity_id < ?5))",
        (old_path, &lower, new_path, first_kept_character, &upper),
    )?;
    Ok(affected)
}

pub fn delete_folder_tree(connection: &Connection, path: &str) -> AppResult<usize> {
    let lower = format!("{path}/");
    let upper = format!("{path}0");
    let affected = connection.execute(
        "DELETE FROM favorites
         WHERE entity_type = 'folder'
           AND (entity_id = ?1 OR (entity_id >= ?2 AND entity_id < ?3))",
        (path, &lower, &upper),
    )?;
    Ok(affected)
}

pub fn prune_folders(connection: &Connection, existing: &[String]) -> AppResult<usize> {
    let mut removed = 0;
    for favorite in list(connection)? {
        let is_folder = favorite.entity_type == FavoriteType::Folder.as_str();
        let is_gone = !existing.contains(&favorite.entity_id);
        if is_folder && is_gone {
            removed += delete(connection, &favorite.entity_type, &favorite.entity_id)?;
        }
    }
    Ok(removed)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{connection::open_in_memory, migrations};

    const NOW: &str = "2026-11-08T10:00:00.000Z";

    fn migrated_connection() -> Connection {
        let mut connection = open_in_memory().expect("opens");
        migrations::run(&mut connection).expect("migrates");
        connection
            .execute_batch(
                "INSERT INTO projects (id, name, created_at, updated_at) VALUES ('p1', 'Website', 'x', 'x');
                 INSERT INTO boards (id, project_id, name, created_at, updated_at) VALUES ('b1', 'p1', 'Sprint', 'x', 'x');
                 INSERT INTO tasks (id, project_id, title, position, created_at, updated_at) VALUES ('t1', 'p1', 'Fix bug', 'V', 'x', 'x');",
            )
            .expect("seeds");
        connection
    }

    #[test]
    fn insert_list_and_delete_round_trip_in_position_order() {
        let connection = migrated_connection();
        insert(&connection, "project", "p1", "B", NOW).expect("inserts");
        insert(&connection, "board", "b1", "A", NOW).expect("inserts");

        let listed = list(&connection).expect("lists");

        let ids: Vec<&str> = listed
            .iter()
            .map(|favorite| favorite.entity_id.as_str())
            .collect();
        assert_eq!(ids, ["b1", "p1"]);
        assert!(is_favorite(&connection, "project", "p1").expect("reads"));
        assert_eq!(delete(&connection, "project", "p1").expect("deletes"), 1);
        assert_eq!(delete(&connection, "project", "p1").expect("deletes"), 0);
        assert!(!is_favorite(&connection, "project", "p1").expect("reads"));
    }

    #[test]
    fn last_position_and_set_position_work() {
        let connection = migrated_connection();
        assert_eq!(last_position(&connection).expect("reads"), None);
        insert(&connection, "project", "p1", "B", NOW).expect("inserts");
        insert(&connection, "board", "b1", "D", NOW).expect("inserts");

        assert_eq!(
            last_position(&connection).expect("reads").as_deref(),
            Some("D")
        );
        assert_eq!(
            set_position(&connection, "board", "b1", "A").expect("sets"),
            1
        );
        assert_eq!(
            set_position(&connection, "board", "ghost", "Z").expect("sets"),
            0
        );
        assert_eq!(
            last_position(&connection).expect("reads").as_deref(),
            Some("B")
        );
    }

    #[test]
    fn entities_are_checked_by_type() {
        let connection = migrated_connection();

        assert!(entity_exists(&connection, FavoriteType::Project, "p1").expect("reads"));
        assert!(entity_exists(&connection, FavoriteType::Board, "b1").expect("reads"));
        assert!(entity_exists(&connection, FavoriteType::Task, "t1").expect("reads"));
        assert!(!entity_exists(&connection, FavoriteType::Task, "b1").expect("reads"));
        assert!(!entity_exists(&connection, FavoriteType::Note, "n1").expect("reads"));
        assert!(!entity_exists(&connection, FavoriteType::Folder, "x").expect("reads"));
    }

    #[test]
    fn resolving_gives_titles_context_and_the_archived_flag() {
        let connection = migrated_connection();

        let project = resolve(&connection, FavoriteType::Project, "p1")
            .expect("resolves")
            .expect("found");
        let board = resolve(&connection, FavoriteType::Board, "b1")
            .expect("resolves")
            .expect("found");
        let task = resolve(&connection, FavoriteType::Task, "t1")
            .expect("resolves")
            .expect("found");
        connection
            .execute("UPDATE projects SET archived_at = 'x' WHERE id = 'p1'", [])
            .expect("archives");
        let archived_task = resolve(&connection, FavoriteType::Task, "t1")
            .expect("resolves")
            .expect("found");
        let archived_board = resolve(&connection, FavoriteType::Board, "b1")
            .expect("resolves")
            .expect("found");

        assert_eq!(
            (project.title.as_str(), project.is_archived),
            ("Website", false)
        );
        assert_eq!(
            (board.title.as_str(), board.context.as_deref()),
            ("Sprint", Some("Website"))
        );
        assert_eq!(board.project_id.as_deref(), Some("p1"));
        assert_eq!(
            (task.title.as_str(), task.context.as_deref()),
            ("Fix bug", Some("Website"))
        );
        assert!(archived_task.is_archived);
        assert!(archived_board.is_archived);
        assert_eq!(
            resolve(&connection, FavoriteType::Task, "ghost").expect("resolves"),
            None
        );
        assert_eq!(
            resolve(&connection, FavoriteType::Folder, "x").expect("resolves"),
            None
        );
    }

    #[test]
    fn folder_favorites_follow_renames_moves_and_deletes_of_the_tree_only() {
        let connection = migrated_connection();
        for (path, position) in [
            ("docs", "A"),
            ("docs/deep", "B"),
            ("docs2", "C"),
            ("other/docs", "D"),
        ] {
            insert(&connection, "folder", path, position, NOW).expect("inserts");
        }
        insert(&connection, "project", "docs", "E", NOW).expect("not a folder");

        let moved = rename_folder(&connection, "docs", "Archive/old docs").expect("renames");
        let ids = |connection: &Connection| -> Vec<String> {
            list(connection)
                .expect("lists")
                .into_iter()
                .map(|favorite| favorite.entity_id)
                .collect()
        };

        assert_eq!(moved, 2);
        assert_eq!(
            ids(&connection),
            [
                "Archive/old docs",
                "Archive/old docs/deep",
                "docs2",
                "other/docs",
                "docs"
            ]
        );
        let removed = delete_folder_tree(&connection, "Archive/old docs").expect("deletes");
        assert_eq!(removed, 2);
        assert_eq!(ids(&connection), ["docs2", "other/docs", "docs"]);
    }

    #[test]
    fn pruning_keeps_existing_folders_and_other_types() {
        let connection = migrated_connection();
        insert(&connection, "folder", "alive", "A", NOW).expect("inserts");
        insert(&connection, "folder", "gone", "B", NOW).expect("inserts");
        insert(&connection, "project", "p1", "C", NOW).expect("inserts");

        let removed = prune_folders(&connection, &["alive".to_string()]).expect("prunes");

        assert_eq!(removed, 1);
        let ids: Vec<String> = list(&connection)
            .expect("lists")
            .into_iter()
            .map(|favorite| favorite.entity_id)
            .collect();
        assert_eq!(ids, ["alive", "p1"]);
    }
}
