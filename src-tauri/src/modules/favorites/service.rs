use std::path::Path;

use super::models::{FavoriteEntry, FavoriteRef, FavoriteType};
use super::repository::{self, Resolved, StoredFavorite};
use crate::error::{AppError, AppResult};
use crate::modules::notes::vault_service::vault_root;
use crate::shared::position::{self, Slot};
use crate::shared::time;
use crate::state::AppState;
use crate::vault::paths::{existing_directory, name_of, normalize_relative, parent_of};

/// Adds the item to the favorites (at the end) or removes it if it already is one. Returns
/// whether it is a favorite afterwards. Adding needs the item to exist; removing never does, so a
/// favorite can always be dropped.
pub fn toggle(state: &AppState, reference: FavoriteRef) -> AppResult<bool> {
    let entity_id = canonical_id(&reference)?;
    let kind = reference.entity_type;

    let connection = state.database();
    let is_favorite = repository::is_favorite(&connection, kind.as_str(), &entity_id)?;
    if is_favorite {
        repository::delete(&connection, kind.as_str(), &entity_id)?;
        return Ok(false);
    }

    ensure_exists(state, &connection, kind, &entity_id)?;
    let next_position = match repository::last_position(&connection)? {
        Some(last) => position::after(&last)?,
        None => position::first(),
    };
    repository::insert(
        &connection,
        kind.as_str(),
        &entity_id,
        &next_position,
        &time::now(),
    )?;
    Ok(true)
}

/// The favorites in the user's order, with their current titles. Items that no longer resolve
/// (a folder deleted outside the app, a folder while no vault is configured) are left out.
pub fn list(state: &AppState) -> AppResult<Vec<FavoriteEntry>> {
    let connection = state.database();
    let root = vault_root(state).ok();
    let mut entries = Vec::new();
    for stored in repository::list(&connection)? {
        let Some(kind) = FavoriteType::parse(&stored.entity_type) else {
            log::error!("unknown favorite type '{}'", stored.entity_type);
            return Err(AppError::Internal);
        };
        let resolved = match kind {
            FavoriteType::Folder => resolve_folder(root.as_deref(), &stored.entity_id),
            _ => repository::resolve(&connection, kind, &stored.entity_id)?,
        };
        if let Some(resolved) = resolved {
            entries.push(entry_of(kind, stored, resolved));
        }
    }
    Ok(entries)
}

/// Moves a favorite right after another one (`None` puts it first).
pub fn move_favorite(
    state: &AppState,
    reference: FavoriteRef,
    after: Option<FavoriteRef>,
) -> AppResult<()> {
    let target = key_of(&reference.entity_type, &canonical_id(&reference)?);
    let after_key = match &after {
        Some(other) => Some(key_of(&other.entity_type, &canonical_id(other)?)),
        None => None,
    };

    let connection = state.database();
    let stored = repository::list(&connection)?;
    let keyed: Vec<(String, &StoredFavorite)> = stored
        .iter()
        .map(|favorite| {
            (
                format!("{}:{}", favorite.entity_type, favorite.entity_id),
                favorite,
            )
        })
        .collect();
    let current = keyed
        .iter()
        .find(|(key, _)| *key == target)
        .map(|(_, favorite)| *favorite)
        .ok_or_else(|| AppError::NotFound("favorite".into()))?;

    let ordered: Vec<Slot<'_>> = keyed
        .iter()
        .map(|(key, favorite)| Slot {
            id: key.as_str(),
            position: favorite.position.as_str(),
        })
        .collect();
    let is_already_there = position::previous_sibling_id(&ordered, &target) == after_key.as_deref();
    if is_already_there {
        return Ok(());
    }
    let siblings: Vec<Slot<'_>> = ordered
        .iter()
        .filter(|slot| slot.id != target)
        .copied()
        .collect();
    let new_position = position::place_after(&siblings, after_key.as_deref())?;
    repository::set_position(
        &connection,
        &current.entity_type,
        &current.entity_id,
        &new_position,
    )?;
    Ok(())
}

fn key_of(kind: &FavoriteType, entity_id: &str) -> String {
    format!("{}:{entity_id}", kind.as_str())
}

/// The id as stored: trimmed, and for folders a normalized path inside the vault.
fn canonical_id(reference: &FavoriteRef) -> AppResult<String> {
    if reference.entity_type == FavoriteType::Folder {
        let path = normalize_relative(&reference.entity_id)?;
        let is_vault_root = path.is_empty();
        if is_vault_root {
            return Err(AppError::Validation(
                "choose a folder inside the vault, not the vault itself".into(),
            ));
        }
        return Ok(path);
    }
    let id = reference.entity_id.trim();
    let is_blank = id.is_empty();
    if is_blank {
        return Err(AppError::Validation("the favorite needs an id".into()));
    }
    Ok(id.to_string())
}

fn ensure_exists(
    state: &AppState,
    connection: &rusqlite::Connection,
    kind: FavoriteType,
    entity_id: &str,
) -> AppResult<()> {
    let exists = match kind {
        FavoriteType::Folder => {
            let root = vault_root(state)?;
            existing_directory(&root, entity_id).is_ok()
        }
        _ => repository::entity_exists(connection, kind, entity_id)?,
    };
    if !exists {
        return Err(AppError::NotFound(kind.as_str().into()));
    }
    Ok(())
}

fn resolve_folder(root: Option<&Path>, path: &str) -> Option<Resolved> {
    let root = root?;
    existing_directory(root, path).ok()?;
    let parent = parent_of(path);
    Some(Resolved {
        title: name_of(path).to_string(),
        context: (!parent.is_empty()).then(|| parent.to_string()),
        path: Some(path.to_string()),
        ..Resolved::default()
    })
}

fn entry_of(kind: FavoriteType, stored: StoredFavorite, resolved: Resolved) -> FavoriteEntry {
    FavoriteEntry {
        entity_type: kind,
        entity_id: stored.entity_id,
        title: resolved.title,
        context: resolved.context,
        project_id: resolved.project_id,
        board_id: resolved.board_id,
        parent_task_id: resolved.parent_task_id,
        path: resolved.path,
        is_archived: resolved.is_archived,
        created_at: stored.created_at,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{connection::open_in_memory, migrations};
    use crate::modules::boards::models::{ColumnKind, CreateBoardInput, NewColumn};
    use crate::modules::boards::service as boards;
    use crate::modules::folders::models::CreateFolderInput;
    use crate::modules::folders::service as folders;
    use crate::modules::notes::models::CreateNoteInput;
    use crate::modules::notes::note_service as notes;
    use crate::modules::notes::vault_service::{SetupVaultInput, reindex, setup};
    use crate::modules::projects::models::CreateProjectInput;
    use crate::modules::projects::service as projects;
    use crate::modules::tasks::models::{CreateSubtaskInput, CreateTaskInput};
    use crate::modules::tasks::{service as tasks, subtask_service as subtasks};
    use std::fs;

    struct Fixture {
        state: AppState,
        vault: tempfile::TempDir,
    }

    fn fixture() -> Fixture {
        let mut connection = open_in_memory().expect("opens");
        migrations::run(&mut connection).expect("migrates");
        let state = AppState::new(connection, None);
        let vault = tempfile::tempdir().expect("vault");
        setup(
            &state,
            SetupVaultInput {
                path: vault.path().to_string_lossy().into_owned(),
                create: false,
            },
        )
        .expect("sets up");
        Fixture { state, vault }
    }

    fn reference(kind: FavoriteType, id: &str) -> FavoriteRef {
        FavoriteRef {
            entity_type: kind,
            entity_id: id.into(),
        }
    }

    fn project(fixture: &Fixture, name: &str) -> String {
        projects::create(
            &fixture.state,
            CreateProjectInput {
                name: name.into(),
                description: None,
                icon: None,
                color: None,
            },
        )
        .expect("creates project")
        .id
    }

    fn board(fixture: &Fixture, project_id: &str, name: &str) -> String {
        boards::create(
            &fixture.state,
            CreateBoardInput {
                project_id: project_id.into(),
                name: name.into(),
                columns: Some(vec![NewColumn::new("Todo", ColumnKind::Todo)]),
            },
        )
        .expect("creates board")
        .board
        .id
    }

    fn task(fixture: &Fixture, project_id: &str, title: &str) -> String {
        tasks::create(
            &fixture.state,
            CreateTaskInput {
                project_id: project_id.into(),
                title: title.into(),
                description: None,
                priority: None,
                due_date: None,
                column_id: None,
            },
        )
        .expect("creates task")
        .id
    }

    fn note(fixture: &Fixture, title: &str) -> String {
        notes::create(
            &fixture.state,
            CreateNoteInput {
                folder_path: None,
                title: title.into(),
                content: None,
                tags: None,
            },
        )
        .expect("creates note")
        .id
    }

    fn folder(fixture: &Fixture, parent: Option<&str>, name: &str) -> String {
        folders::create(
            &fixture.state,
            CreateFolderInput {
                parent_path: parent.map(str::to_string),
                name: name.into(),
            },
        )
        .expect("creates folder")
        .path
    }

    fn titles(fixture: &Fixture) -> Vec<String> {
        list(&fixture.state)
            .expect("lists")
            .into_iter()
            .map(|entry| entry.title)
            .collect()
    }

    fn pin(fixture: &Fixture, kind: FavoriteType, id: &str) {
        assert!(toggle(&fixture.state, reference(kind, id)).expect("toggles"));
    }

    // ---- toggle

    #[test]
    fn toggling_adds_then_removes_and_reports_the_new_state() {
        let fixture = fixture();
        let id = project(&fixture, "Website");

        let added = toggle(&fixture.state, reference(FavoriteType::Project, &id)).expect("adds");
        let listed = titles(&fixture);
        let removed =
            toggle(&fixture.state, reference(FavoriteType::Project, &id)).expect("removes");

        assert!(added);
        assert_eq!(listed, ["Website"]);
        assert!(!removed);
        assert!(titles(&fixture).is_empty());
    }

    #[test]
    fn every_kind_of_item_can_be_favorited_and_resolves_its_title_and_context() {
        let fixture = fixture();
        let p = project(&fixture, "Website");
        let b = board(&fixture, &p, "Sprint");
        let t = task(&fixture, &p, "Fix bug");
        let n = note(&fixture, "Spring Boot");
        folder(&fixture, None, "Projects");
        folder(&fixture, Some("Projects"), "Web");
        for (kind, id) in [
            (FavoriteType::Project, p.as_str()),
            (FavoriteType::Board, b.as_str()),
            (FavoriteType::Task, t.as_str()),
            (FavoriteType::Note, n.as_str()),
            (FavoriteType::Folder, "Projects/Web"),
        ] {
            pin(&fixture, kind, id);
        }

        let entries = list(&fixture.state).expect("lists");

        let summary: Vec<(FavoriteType, &str, Option<&str>)> = entries
            .iter()
            .map(|entry| {
                (
                    entry.entity_type,
                    entry.title.as_str(),
                    entry.context.as_deref(),
                )
            })
            .collect();
        assert_eq!(
            summary,
            [
                (FavoriteType::Project, "Website", None),
                (FavoriteType::Board, "Sprint", Some("Website")),
                (FavoriteType::Task, "Fix bug", Some("Website")),
                (FavoriteType::Note, "Spring Boot", None),
                (FavoriteType::Folder, "Web", Some("Projects")),
            ]
        );
        assert_eq!(entries[1].project_id.as_deref(), Some(p.as_str()));
        assert_eq!(entries[1].board_id.as_deref(), Some(b.as_str()));
        assert_eq!(entries[3].path.as_deref(), Some("Spring Boot.md"));
        assert_eq!(entries[4].path.as_deref(), Some("Projects/Web"));
        assert!(entries.iter().all(|entry| !entry.is_archived));
    }

    #[test]
    fn adding_an_item_that_does_not_exist_is_refused_but_removing_always_works() {
        let fixture = fixture();

        for kind in FavoriteType::ALL {
            let result = toggle(&fixture.state, reference(kind, "ghost"));
            assert!(matches!(result, Err(AppError::NotFound(_))), "{kind:?}");
        }
        fixture
            .state
            .database()
            .execute(
                "INSERT INTO favorites (entity_type, entity_id, position, created_at) VALUES ('task', 'dangling', 'V', 'x')",
                [],
            )
            .expect("dangling row");

        let removed =
            toggle(&fixture.state, reference(FavoriteType::Task, "dangling")).expect("removes");

        assert!(!removed);
    }

    #[test]
    fn ids_are_trimmed_and_blank_ids_and_unsafe_folder_paths_are_rejected() {
        let fixture = fixture();
        let id = project(&fixture, "Website");

        let padded = toggle(
            &fixture.state,
            reference(FavoriteType::Project, &format!("  {id}  ")),
        );

        assert!(padded.expect("toggles"));
        for bad in [
            reference(FavoriteType::Project, "   "),
            reference(FavoriteType::Folder, ""),
            reference(FavoriteType::Folder, "/"),
            reference(FavoriteType::Folder, "../outside"),
            reference(FavoriteType::Folder, "attachments"),
            reference(FavoriteType::Folder, ".hidden"),
        ] {
            assert!(matches!(
                toggle(&fixture.state, bad),
                Err(AppError::Validation(_))
            ));
        }
    }

    #[test]
    fn folder_favorites_need_a_configured_vault_and_an_existing_folder() {
        let fixture = fixture();
        let mut connection = open_in_memory().expect("opens");
        migrations::run(&mut connection).expect("migrates");
        let no_vault = AppState::new(connection, None);

        assert!(matches!(
            toggle(&fixture.state, reference(FavoriteType::Folder, "Missing")),
            Err(AppError::NotFound(_))
        ));
        assert!(matches!(
            toggle(&no_vault, reference(FavoriteType::Folder, "Any")),
            Err(AppError::NotFound(_))
        ));
        assert!(list(&no_vault).expect("lists").is_empty());
    }

    #[test]
    fn an_id_cannot_be_favorited_as_a_different_type_than_it_is() {
        let fixture = fixture();
        let id = project(&fixture, "Website");

        let as_board = toggle(&fixture.state, reference(FavoriteType::Board, &id));
        let as_project = toggle(&fixture.state, reference(FavoriteType::Project, &id));

        assert!(matches!(as_board, Err(AppError::NotFound(_))));
        assert!(as_project.expect("toggles"));
        assert_eq!(titles(&fixture), ["Website"]);
    }

    // ---- order

    #[test]
    fn favorites_are_listed_in_the_order_they_were_added() {
        let fixture = fixture();
        let a = project(&fixture, "A");
        let b = project(&fixture, "B");
        let c = project(&fixture, "C");

        pin(&fixture, FavoriteType::Project, &c);
        pin(&fixture, FavoriteType::Project, &a);
        pin(&fixture, FavoriteType::Project, &b);

        assert_eq!(titles(&fixture), ["C", "A", "B"]);
    }

    #[test]
    fn moving_puts_a_favorite_first_in_the_middle_or_last() {
        let fixture = fixture();
        let ids: Vec<String> = ["A", "B", "C", "D"]
            .iter()
            .map(|name| project(&fixture, name))
            .collect();
        for id in &ids {
            pin(&fixture, FavoriteType::Project, id);
        }
        let r = |index: usize| reference(FavoriteType::Project, &ids[index]);

        move_favorite(&fixture.state, r(3), None).expect("D first");
        assert_eq!(titles(&fixture), ["D", "A", "B", "C"]);
        move_favorite(&fixture.state, r(3), Some(r(1))).expect("D after B");
        assert_eq!(titles(&fixture), ["A", "B", "D", "C"]);
        move_favorite(&fixture.state, r(0), Some(r(2))).expect("A last");
        assert_eq!(titles(&fixture), ["B", "D", "C", "A"]);
    }

    #[test]
    fn moving_to_the_current_place_is_a_no_op_and_bad_anchors_are_rejected() {
        let fixture = fixture();
        let a = project(&fixture, "A");
        let b = project(&fixture, "B");
        let t = task(&fixture, &a, "T");
        pin(&fixture, FavoriteType::Project, &a);
        pin(&fixture, FavoriteType::Project, &b);
        let ra = reference(FavoriteType::Project, &a);
        let rb = reference(FavoriteType::Project, &b);

        assert!(move_favorite(&fixture.state, ra.clone(), None).is_ok());
        assert!(move_favorite(&fixture.state, rb.clone(), Some(ra.clone())).is_ok());
        assert_eq!(titles(&fixture), ["A", "B"]);
        assert!(matches!(
            move_favorite(
                &fixture.state,
                ra.clone(),
                Some(reference(FavoriteType::Task, &t))
            ),
            Err(AppError::InvalidMove)
        ));
        assert!(matches!(
            move_favorite(&fixture.state, ra.clone(), Some(ra)),
            Err(AppError::InvalidMove)
        ));
        assert!(matches!(
            move_favorite(&fixture.state, reference(FavoriteType::Task, &t), None),
            Err(AppError::NotFound(_))
        ));
        assert_eq!(titles(&fixture), ["A", "B"]);
    }

    // ---- staying in step with the data

    #[test]
    fn renamed_items_show_their_new_titles() {
        let fixture = fixture();
        let n = note(&fixture, "Old name");
        pin(&fixture, FavoriteType::Note, &n);

        notes::rename(&fixture.state, &n, "New name").expect("renames");

        assert_eq!(titles(&fixture), ["New name"]);
    }

    #[test]
    fn deleting_the_item_removes_its_favorite() {
        let fixture = fixture();
        let p = project(&fixture, "P");
        let b = board(&fixture, &p, "B");
        let t = task(&fixture, &p, "T");
        let n = note(&fixture, "N");
        pin(&fixture, FavoriteType::Board, &b);
        pin(&fixture, FavoriteType::Task, &t);
        pin(&fixture, FavoriteType::Note, &n);
        pin(&fixture, FavoriteType::Project, &p);

        notes::delete(&fixture.state, &n).expect("deletes note");
        assert_eq!(titles(&fixture), ["B", "T", "P"]);
        tasks::delete(&fixture.state, &t).expect("deletes task");
        assert_eq!(titles(&fixture), ["B", "P"]);
        projects::delete(&fixture.state, &p).expect("deletes project");

        assert!(titles(&fixture).is_empty());
        let rows: i64 = fixture
            .state
            .database()
            .query_row("SELECT COUNT(*) FROM favorites", [], |row| row.get(0))
            .expect("counts");
        assert_eq!(rows, 0);
    }

    #[test]
    fn archived_items_stay_in_the_list_flagged_and_unflag_on_restore() {
        let fixture = fixture();
        let p = project(&fixture, "P");
        let t = task(&fixture, &p, "T");
        let child = subtasks::create(
            &fixture.state,
            CreateSubtaskInput {
                parent_task_id: t.clone(),
                title: "Child".into(),
            },
        )
        .expect("creates subtask")
        .id;
        pin(&fixture, FavoriteType::Task, &t);
        pin(&fixture, FavoriteType::Task, &child);
        let flags = |fixture: &Fixture| -> Vec<bool> {
            list(&fixture.state)
                .expect("lists")
                .iter()
                .map(|entry| entry.is_archived)
                .collect()
        };

        tasks::archive(&fixture.state, &t).expect("archives");
        assert_eq!(
            flags(&fixture),
            [true, true],
            "the subtask follows its archived parent"
        );
        tasks::restore(&fixture.state, &t).expect("restores");
        assert_eq!(flags(&fixture), [false, false]);
        projects::archive(&fixture.state, &p).expect("archives project");
        assert_eq!(flags(&fixture), [true, true]);
        let entries = list(&fixture.state).expect("lists");
        assert_eq!(entries[1].parent_task_id.as_deref(), Some(t.as_str()));
    }

    #[test]
    fn folder_favorites_follow_rename_move_and_delete() {
        let fixture = fixture();
        folder(&fixture, None, "Research");
        folder(&fixture, Some("Research"), "Papers");
        folder(&fixture, None, "Archive");
        pin(&fixture, FavoriteType::Folder, "Research");
        pin(&fixture, FavoriteType::Folder, "Research/Papers");
        let paths = |fixture: &Fixture| -> Vec<String> {
            list(&fixture.state)
                .expect("lists")
                .into_iter()
                .filter_map(|entry| entry.path)
                .collect()
        };

        folders::rename(&fixture.state, "Research", "Studies").expect("renames");
        assert_eq!(paths(&fixture), ["Studies", "Studies/Papers"]);
        folders::move_folder(&fixture.state, "Studies", Some("Archive")).expect("moves");
        assert_eq!(
            paths(&fixture),
            ["Archive/Studies", "Archive/Studies/Papers"]
        );
        assert_eq!(titles(&fixture), ["Studies", "Papers"]);
        folders::delete(&fixture.state, "Archive", true).expect("deletes");

        assert!(paths(&fixture).is_empty());
        let rows: i64 = fixture
            .state
            .database()
            .query_row("SELECT COUNT(*) FROM favorites", [], |row| row.get(0))
            .expect("counts");
        assert_eq!(rows, 0);
    }

    #[test]
    fn a_folder_removed_outside_the_app_disappears_from_the_list_and_is_pruned_on_reindex() {
        let fixture = fixture();
        folder(&fixture, None, "Temp");
        let keep = folder(&fixture, None, "Keep");
        pin(&fixture, FavoriteType::Folder, "Temp");
        pin(&fixture, FavoriteType::Folder, &keep);

        fs::remove_dir(fixture.vault.path().join("Temp")).expect("removes outside the app");
        assert_eq!(titles(&fixture), ["Keep"]);
        reindex(&fixture.state).expect("reindexes");

        let rows: i64 = fixture
            .state
            .database()
            .query_row("SELECT COUNT(*) FROM favorites", [], |row| row.get(0))
            .expect("counts");
        assert_eq!(rows, 1);
    }

    #[test]
    fn a_note_moved_to_another_folder_keeps_its_favorite() {
        let fixture = fixture();
        let n = note(&fixture, "Travels");
        folder(&fixture, None, "Archive");
        pin(&fixture, FavoriteType::Note, &n);

        notes::move_note(&fixture.state, &n, Some("Archive")).expect("moves");

        let entries = list(&fixture.state).expect("lists");
        assert_eq!(entries[0].path.as_deref(), Some("Archive/Travels.md"));
        assert_eq!(entries[0].context.as_deref(), Some("Archive"));
    }

    #[test]
    fn deleting_a_folder_with_a_favorited_note_removes_the_note_favorite_too() {
        let fixture = fixture();
        folder(&fixture, None, "Box");
        let n = notes::create(
            &fixture.state,
            CreateNoteInput {
                folder_path: Some("Box".into()),
                title: "Inside".into(),
                content: None,
                tags: None,
            },
        )
        .expect("creates note")
        .id;
        pin(&fixture, FavoriteType::Note, &n);

        folders::delete(&fixture.state, "Box", true).expect("deletes");

        assert!(titles(&fixture).is_empty());
    }
}
