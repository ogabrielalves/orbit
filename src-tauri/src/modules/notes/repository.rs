use rusqlite::{Connection, OptionalExtension, Row};

use super::models::{LinkRecord, NoteRecord};
use crate::error::AppResult;

const NOTE_COLUMNS: &str = "id, path, title, title_key, hash, created_at, modified_at";

fn map_note(row: &Row<'_>) -> rusqlite::Result<NoteRecord> {
    Ok(NoteRecord {
        id: row.get(0)?,
        path: row.get(1)?,
        title: row.get(2)?,
        title_key: row.get(3)?,
        hash: row.get(4)?,
        created_at: row.get(5)?,
        modified_at: row.get(6)?,
    })
}

pub fn insert(connection: &Connection, note: &NoteRecord) -> AppResult<()> {
    connection.execute(
        "INSERT INTO notes (id, path, title, title_key, hash, created_at, modified_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        (
            &note.id,
            &note.path,
            &note.title,
            &note.title_key,
            &note.hash,
            &note.created_at,
            &note.modified_at,
        ),
    )?;
    Ok(())
}

pub fn update(connection: &Connection, note: &NoteRecord) -> AppResult<usize> {
    let affected = connection.execute(
        "UPDATE notes
         SET path = ?2, title = ?3, title_key = ?4, hash = ?5, created_at = ?6, modified_at = ?7
         WHERE id = ?1",
        (
            &note.id,
            &note.path,
            &note.title,
            &note.title_key,
            &note.hash,
            &note.created_at,
            &note.modified_at,
        ),
    )?;
    Ok(affected)
}

pub fn find_by_id(connection: &Connection, id: &str) -> AppResult<Option<NoteRecord>> {
    let sql = format!("SELECT {NOTE_COLUMNS} FROM notes WHERE id = ?1");
    let note = connection.query_row(&sql, [id], map_note).optional()?;
    Ok(note)
}

pub fn find_by_path(connection: &Connection, path: &str) -> AppResult<Option<NoteRecord>> {
    let sql = format!("SELECT {NOTE_COLUMNS} FROM notes WHERE path = ?1");
    let note = connection.query_row(&sql, [path], map_note).optional()?;
    Ok(note)
}

pub fn list_all(connection: &Connection) -> AppResult<Vec<NoteRecord>> {
    let sql = format!("SELECT {NOTE_COLUMNS} FROM notes ORDER BY path");
    let mut statement = connection.prepare(&sql)?;
    let rows = statement.query_map([], map_note)?;
    let notes = rows.collect::<Result<Vec<_>, _>>()?;
    Ok(notes)
}

/// Notes whose path lies under `directory` (a relative path without a trailing slash).
pub fn list_under(connection: &Connection, directory: &str) -> AppResult<Vec<NoteRecord>> {
    let lower = format!("{directory}/");
    let upper = format!("{directory}0"); // '0' is the character right after '/'
    let sql =
        format!("SELECT {NOTE_COLUMNS} FROM notes WHERE path >= ?1 AND path < ?2 ORDER BY path");
    let mut statement = connection.prepare(&sql)?;
    let rows = statement.query_map((&lower, &upper), map_note)?;
    let notes = rows.collect::<Result<Vec<_>, _>>()?;
    Ok(notes)
}

/// Notes that contain at least one link to `target_key`.
pub fn list_linking_to(connection: &Connection, target_key: &str) -> AppResult<Vec<NoteRecord>> {
    let sql = "SELECT n.id, n.path, n.title, n.title_key, n.hash, n.created_at, n.modified_at
               FROM notes n JOIN note_links l ON l.source_note_id = n.id
               WHERE l.target_key = ?1 ORDER BY n.path";
    let mut statement = connection.prepare(sql)?;
    let rows = statement.query_map([target_key], map_note)?;
    let notes = rows.collect::<Result<Vec<_>, _>>()?;
    Ok(notes)
}

/// How many notes other than `except_id` carry this normalized title.
pub fn count_with_title_key(
    connection: &Connection,
    title_key: &str,
    except_id: &str,
) -> AppResult<u32> {
    let total = connection.query_row(
        "SELECT COUNT(*) FROM notes WHERE title_key = ?1 AND id <> ?2",
        (title_key, except_id),
        |row| row.get(0),
    )?;
    Ok(total)
}

pub fn delete(connection: &Connection, id: &str) -> AppResult<usize> {
    let affected = connection.execute("DELETE FROM notes WHERE id = ?1", [id])?;
    Ok(affected)
}

/// Re-points every note under `old_directory` to `new_directory` after the folder was renamed
/// or moved on disk. Both are relative paths without a trailing slash.
pub fn rename_directory(
    connection: &Connection,
    old_directory: &str,
    new_directory: &str,
) -> AppResult<usize> {
    let old_prefix = format!("{old_directory}/");
    let upper = format!("{old_directory}0");
    let new_prefix = format!("{new_directory}/");
    let first_kept_character = i64::try_from(old_prefix.chars().count() + 1).unwrap_or(i64::MAX);
    let affected = connection.execute(
        "UPDATE notes SET path = ?3 || substr(path, ?4) WHERE path >= ?1 AND path < ?2",
        (&old_prefix, &upper, &new_prefix, first_kept_character),
    )?;
    Ok(affected)
}

/// Forgets every note under `directory`. Returns how many rows went away.
pub fn delete_directory(connection: &Connection, directory: &str) -> AppResult<usize> {
    let lower = format!("{directory}/");
    let upper = format!("{directory}0");
    let affected = connection.execute(
        "DELETE FROM notes WHERE path >= ?1 AND path < ?2",
        (&lower, &upper),
    )?;
    Ok(affected)
}

pub fn replace_links(
    connection: &Connection,
    source_note_id: &str,
    links: &[LinkRecord],
) -> AppResult<()> {
    connection.execute(
        "DELETE FROM note_links WHERE source_note_id = ?1",
        [source_note_id],
    )?;
    for link in links {
        connection.execute(
            "INSERT INTO note_links (source_note_id, target_key, target_title, link_count)
             VALUES (?1, ?2, ?3, ?4)",
            (
                source_note_id,
                &link.target_key,
                &link.target_title,
                link.link_count,
            ),
        )?;
    }
    Ok(())
}

pub fn list_links(connection: &Connection, source_note_id: &str) -> AppResult<Vec<LinkRecord>> {
    let mut statement = connection.prepare(
        "SELECT target_key, target_title, link_count FROM note_links
         WHERE source_note_id = ?1 ORDER BY target_key",
    )?;
    let rows = statement.query_map([source_note_id], |row| {
        Ok(LinkRecord {
            target_key: row.get(0)?,
            target_title: row.get(1)?,
            link_count: row.get(2)?,
        })
    })?;
    let links = rows.collect::<Result<Vec<_>, _>>()?;
    Ok(links)
}

/// The note a `[[link]]` with this normalized title points to. When several notes share a title
/// the oldest one wins (then the first path), so a link never jumps between notes.
pub fn resolve_title(connection: &Connection, title_key: &str) -> AppResult<Option<NoteRecord>> {
    let sql = format!(
        "SELECT {NOTE_COLUMNS} FROM notes WHERE title_key = ?1 ORDER BY created_at, path LIMIT 1"
    );
    let note = connection
        .query_row(&sql, [title_key], map_note)
        .optional()?;
    Ok(note)
}

/// Notes that link to `note_id` (through its title), other than the note itself, with how many
/// times each links to it. Links whose title resolves to a different, older note do not count.
pub fn list_backlinks(connection: &Connection, note_id: &str) -> AppResult<Vec<(NoteRecord, u32)>> {
    let sql = "SELECT n.id, n.path, n.title, n.title_key, n.hash, n.created_at, n.modified_at,
                      l.link_count
               FROM note_links l
               JOIN notes n ON n.id = l.source_note_id
               WHERE l.source_note_id <> ?1
                 AND l.target_key = (SELECT title_key FROM notes WHERE id = ?1)
                 AND ?1 = (SELECT r.id FROM notes r WHERE r.title_key = l.target_key
                           ORDER BY r.created_at, r.path LIMIT 1)
               ORDER BY n.path";
    let mut statement = connection.prepare(sql)?;
    let rows = statement.query_map([note_id], |row| Ok((map_note(row)?, row.get(7)?)))?;
    let backlinks = rows.collect::<Result<Vec<_>, _>>()?;
    Ok(backlinks)
}

/// Every link written in the note, each with the note it resolves to (if any).
pub fn list_outgoing(
    connection: &Connection,
    source_note_id: &str,
) -> AppResult<Vec<(LinkRecord, Option<NoteRecord>)>> {
    let links = list_links(connection, source_note_id)?;
    links
        .into_iter()
        .map(|link| {
            let target = resolve_title(connection, &link.target_key)?;
            Ok((link, target))
        })
        .collect()
}

/// Links whose title matches no note, as (target title as first written, source note), ordered by
/// target and then by the source's path.
pub fn list_unresolved(connection: &Connection) -> AppResult<Vec<(String, NoteRecord)>> {
    let sql = "SELECT l.target_title, n.id, n.path, n.title, n.title_key, n.hash, n.created_at,
                      n.modified_at
               FROM note_links l
               JOIN notes n ON n.id = l.source_note_id
               WHERE NOT EXISTS (SELECT 1 FROM notes t WHERE t.title_key = l.target_key)
               ORDER BY l.target_key, n.path";
    let mut statement = connection.prepare(sql)?;
    let rows = statement.query_map([], |row| {
        let title: String = row.get(0)?;
        let note = NoteRecord {
            id: row.get(1)?,
            path: row.get(2)?,
            title: row.get(3)?,
            title_key: row.get(4)?,
            hash: row.get(5)?,
            created_at: row.get(6)?,
            modified_at: row.get(7)?,
        };
        Ok((title, note))
    })?;
    let unresolved = rows.collect::<Result<Vec<_>, _>>()?;
    Ok(unresolved)
}

pub fn count(connection: &Connection) -> AppResult<u32> {
    let total = connection.query_row("SELECT COUNT(*) FROM notes", [], |row| row.get(0))?;
    Ok(total)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{connection::open_in_memory, migrations};

    const NOW: &str = "2026-11-08T10:00:00.000Z";
    const HASH: &str = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

    fn migrated_connection() -> Connection {
        let mut connection = open_in_memory().expect("opens");
        migrations::run(&mut connection).expect("migrates");
        connection
    }

    fn note(id: &str, path: &str) -> NoteRecord {
        NoteRecord {
            id: id.into(),
            path: path.into(),
            title: format!("Title {id}"),
            title_key: format!("title {id}"),
            hash: HASH.into(),
            created_at: NOW.into(),
            modified_at: NOW.into(),
        }
    }

    fn link(key: &str, count: u32) -> LinkRecord {
        LinkRecord {
            target_key: key.into(),
            target_title: key.to_uppercase(),
            link_count: count,
        }
    }

    #[test]
    fn insert_then_find_by_id_and_by_path_round_trips_every_field() {
        let connection = migrated_connection();
        let original = note("n1", "Folder/a.md");

        insert(&connection, &original).expect("inserts");

        assert_eq!(
            find_by_id(&connection, "n1").expect("reads"),
            Some(original.clone())
        );
        assert_eq!(
            find_by_path(&connection, "Folder/a.md").expect("reads"),
            Some(original)
        );
        assert_eq!(find_by_id(&connection, "ghost").expect("reads"), None);
        assert_eq!(find_by_path(&connection, "ghost.md").expect("reads"), None);
    }

    #[test]
    fn update_changes_every_field_but_the_id() {
        let connection = migrated_connection();
        insert(&connection, &note("n1", "a.md")).expect("inserts");
        let mut changed = note("n1", "moved/b.md");
        changed.title = "New".into();
        changed.title_key = "new".into();
        changed.hash = "f".repeat(64);
        changed.modified_at = "2026-11-09T00:00:00.000Z".into();

        let affected = update(&connection, &changed).expect("updates");

        assert_eq!(affected, 1);
        assert_eq!(find_by_id(&connection, "n1").expect("reads"), Some(changed));
        assert_eq!(
            update(&connection, &note("ghost", "x.md")).expect("updates"),
            0
        );
    }

    #[test]
    fn list_all_is_ordered_by_path_and_count_matches() {
        let connection = migrated_connection();
        insert(&connection, &note("b", "z.md")).expect("inserts");
        insert(&connection, &note("a", "a.md")).expect("inserts");

        let paths: Vec<String> = list_all(&connection)
            .expect("lists")
            .into_iter()
            .map(|note| note.path)
            .collect();

        assert_eq!(paths, ["a.md", "z.md"]);
        assert_eq!(count(&connection).expect("counts"), 2);
    }

    #[test]
    fn list_under_returns_the_subtree_only_and_not_siblings_with_a_similar_prefix() {
        let connection = migrated_connection();
        for (id, path) in [
            ("1", "dir/a.md"),
            ("2", "dir/sub/b.md"),
            ("3", "dir2/c.md"),
            ("4", "dir.md"),
            ("5", "other/d.md"),
        ] {
            insert(&connection, &note(id, path)).expect("inserts");
        }

        let under: Vec<String> = list_under(&connection, "dir")
            .expect("lists")
            .into_iter()
            .map(|note| note.path)
            .collect();

        assert_eq!(under, ["dir/a.md", "dir/sub/b.md"]);
    }

    #[test]
    fn delete_reports_affected_rows_and_removes_the_outgoing_links() {
        let connection = migrated_connection();
        insert(&connection, &note("n1", "a.md")).expect("inserts");
        replace_links(&connection, "n1", &[link("x", 1)]).expect("links");

        let first = delete(&connection, "n1").expect("deletes");
        let second = delete(&connection, "n1").expect("deletes");

        assert_eq!((first, second), (1, 0));
        assert!(list_links(&connection, "n1").expect("lists").is_empty());
    }

    #[test]
    fn replace_links_swaps_the_whole_set() {
        let connection = migrated_connection();
        insert(&connection, &note("n1", "a.md")).expect("inserts");
        replace_links(&connection, "n1", &[link("b", 1), link("a", 3)]).expect("links");

        replace_links(&connection, "n1", &[link("c", 2)]).expect("replaces");
        let after = list_links(&connection, "n1").expect("lists");
        replace_links(&connection, "n1", &[]).expect("clears");

        assert_eq!(after, [link("c", 2)]);
        assert!(list_links(&connection, "n1").expect("lists").is_empty());
    }

    #[test]
    fn links_are_listed_ordered_by_target_key() {
        let connection = migrated_connection();
        insert(&connection, &note("n1", "a.md")).expect("inserts");

        replace_links(&connection, "n1", &[link("b", 1), link("a", 3)]).expect("links");

        let keys: Vec<String> = list_links(&connection, "n1")
            .expect("lists")
            .into_iter()
            .map(|link| link.target_key)
            .collect();
        assert_eq!(keys, ["a", "b"]);
    }

    #[test]
    fn renaming_a_directory_rewrites_the_paths_of_its_subtree_only() {
        let connection = migrated_connection();
        for (id, path) in [
            ("1", "docs/a.md"),
            ("2", "docs/deep/b.md"),
            ("3", "docs2/c.md"),
            ("4", "docs.md"),
            ("5", "other/docs/d.md"),
        ] {
            insert(&connection, &note(id, path)).expect("inserts");
        }

        let affected = rename_directory(&connection, "docs", "Archive/old docs").expect("renames");

        assert_eq!(affected, 2);
        let paths: Vec<String> = list_all(&connection)
            .expect("lists")
            .into_iter()
            .map(|note| note.path)
            .collect();
        assert_eq!(
            paths,
            [
                "Archive/old docs/a.md",
                "Archive/old docs/deep/b.md",
                "docs.md",
                "docs2/c.md",
                "other/docs/d.md"
            ]
        );
    }

    #[test]
    fn renaming_a_directory_handles_multibyte_names() {
        let connection = migrated_connection();
        insert(&connection, &note("1", "Ação/nota.md")).expect("inserts");

        rename_directory(&connection, "Ação", "日本語").expect("renames");

        assert!(
            find_by_path(&connection, "日本語/nota.md")
                .expect("reads")
                .is_some()
        );
    }

    #[test]
    fn deleting_a_directory_removes_its_subtree_and_the_outgoing_links() {
        let connection = migrated_connection();
        for (id, path) in [
            ("1", "docs/a.md"),
            ("2", "docs/deep/b.md"),
            ("3", "docs2/c.md"),
        ] {
            insert(&connection, &note(id, path)).expect("inserts");
        }
        replace_links(&connection, "1", &[link("x", 1)]).expect("links");

        let removed = delete_directory(&connection, "docs").expect("deletes");

        assert_eq!(removed, 2);
        assert_eq!(count(&connection).expect("counts"), 1);
        assert!(list_links(&connection, "1").expect("lists").is_empty());
    }

    #[test]
    fn notes_linking_to_a_target_are_listed_by_path() {
        let connection = migrated_connection();
        insert(&connection, &note("a", "b.md")).expect("inserts");
        insert(&connection, &note("b", "a.md")).expect("inserts");
        insert(&connection, &note("c", "c.md")).expect("inserts");
        replace_links(&connection, "a", &[link("target", 1)]).expect("links");
        replace_links(&connection, "b", &[link("target", 2), link("other", 1)]).expect("links");
        replace_links(&connection, "c", &[link("other", 1)]).expect("links");

        let sources: Vec<String> = list_linking_to(&connection, "target")
            .expect("lists")
            .into_iter()
            .map(|note| note.id)
            .collect();

        assert_eq!(sources, ["b", "a"]);
        assert!(
            list_linking_to(&connection, "nobody")
                .expect("lists")
                .is_empty()
        );
    }

    #[test]
    fn title_keys_are_counted_excluding_the_given_note() {
        let connection = migrated_connection();
        let mut one = note("1", "a.md");
        one.title_key = "same".into();
        let mut two = note("2", "b.md");
        two.title_key = "same".into();
        insert(&connection, &one).expect("inserts");
        insert(&connection, &two).expect("inserts");

        assert_eq!(
            count_with_title_key(&connection, "same", "1").expect("counts"),
            1
        );
        assert_eq!(
            count_with_title_key(&connection, "same", "ghost").expect("counts"),
            2
        );
        assert_eq!(
            count_with_title_key(&connection, "other", "1").expect("counts"),
            0
        );
    }

    fn titled(id: &str, path: &str, title_key: &str, created_at: &str) -> NoteRecord {
        let mut record = note(id, path);
        record.title = title_key.to_uppercase();
        record.title_key = title_key.into();
        record.created_at = created_at.into();
        record
    }

    #[test]
    fn a_title_resolves_to_the_oldest_note_that_has_it() {
        let connection = migrated_connection();
        insert(
            &connection,
            &titled("new", "b.md", "same", "2026-11-09T00:00:00.000Z"),
        )
        .expect("inserts");
        insert(
            &connection,
            &titled("old", "z.md", "same", "2026-11-01T00:00:00.000Z"),
        )
        .expect("inserts");

        let resolved = resolve_title(&connection, "same").expect("resolves");

        assert_eq!(resolved.map(|note| note.id), Some("old".to_string()));
        assert_eq!(
            resolve_title(&connection, "nothing").expect("resolves"),
            None
        );
    }

    #[test]
    fn backlinks_list_other_notes_linking_to_the_title_and_skip_self_links() {
        let connection = migrated_connection();
        insert(&connection, &titled("target", "t.md", "target", NOW)).expect("inserts");
        insert(&connection, &titled("b", "b.md", "b", NOW)).expect("inserts");
        insert(&connection, &titled("a", "a.md", "a", NOW)).expect("inserts");
        insert(&connection, &titled("loner", "l.md", "loner", NOW)).expect("inserts");
        replace_links(&connection, "target", &[link("target", 1)]).expect("self link");
        replace_links(&connection, "b", &[link("target", 3)]).expect("links");
        replace_links(&connection, "a", &[link("target", 1)]).expect("links");
        replace_links(&connection, "loner", &[link("elsewhere", 1)]).expect("links");

        let backlinks: Vec<(String, u32)> = list_backlinks(&connection, "target")
            .expect("lists")
            .into_iter()
            .map(|(note, count)| (note.id, count))
            .collect();

        assert_eq!(backlinks, [("a".to_string(), 1), ("b".to_string(), 3)]);
        assert!(
            list_backlinks(&connection, "loner")
                .expect("lists")
                .is_empty()
        );
        assert!(
            list_backlinks(&connection, "ghost")
                .expect("lists")
                .is_empty()
        );
    }

    #[test]
    fn backlinks_only_count_for_the_note_the_title_resolves_to() {
        let connection = migrated_connection();
        insert(
            &connection,
            &titled("old", "old.md", "twin", "2026-11-01T00:00:00.000Z"),
        )
        .expect("inserts");
        insert(
            &connection,
            &titled("new", "new.md", "twin", "2026-11-09T00:00:00.000Z"),
        )
        .expect("inserts");
        insert(&connection, &titled("src", "src.md", "src", NOW)).expect("inserts");
        replace_links(&connection, "src", &[link("twin", 1)]).expect("links");

        assert_eq!(list_backlinks(&connection, "old").expect("lists").len(), 1);
        assert!(
            list_backlinks(&connection, "new")
                .expect("lists")
                .is_empty()
        );
    }

    #[test]
    fn outgoing_links_come_with_their_resolution() {
        let connection = migrated_connection();
        insert(&connection, &titled("src", "src.md", "src", NOW)).expect("inserts");
        insert(&connection, &titled("hit", "hit.md", "hit", NOW)).expect("inserts");
        replace_links(&connection, "src", &[link("hit", 2), link("miss", 1)]).expect("links");

        let outgoing = list_outgoing(&connection, "src").expect("lists");

        let summary: Vec<(&str, Option<&str>)> = outgoing
            .iter()
            .map(|(link, target)| {
                (
                    link.target_key.as_str(),
                    target.as_ref().map(|note| note.id.as_str()),
                )
            })
            .collect();
        assert_eq!(summary, [("hit", Some("hit")), ("miss", None)]);
    }

    #[test]
    fn unresolved_links_list_only_titles_nobody_has_ordered_by_target_then_source_path() {
        let connection = migrated_connection();
        insert(&connection, &titled("a", "z.md", "a", NOW)).expect("inserts");
        insert(&connection, &titled("b", "y.md", "b", NOW)).expect("inserts");
        insert(&connection, &titled("exists", "e.md", "exists", NOW)).expect("inserts");
        replace_links(&connection, "a", &[link("ghost", 1), link("exists", 1)]).expect("links");
        replace_links(&connection, "b", &[link("ghost", 4), link("apparition", 1)]).expect("links");

        let unresolved: Vec<(String, String)> = list_unresolved(&connection)
            .expect("lists")
            .into_iter()
            .map(|(title, source)| (title, source.id))
            .collect();

        assert_eq!(
            unresolved,
            [
                ("APPARITION".to_string(), "b".to_string()),
                ("GHOST".to_string(), "b".to_string()),
                ("GHOST".to_string(), "a".to_string()),
            ]
        );
    }

    #[test]
    fn the_unresolved_query_uses_the_title_index() {
        let connection = migrated_connection();

        let mut statement = connection
            .prepare(
                "EXPLAIN QUERY PLAN SELECT l.target_title FROM note_links l
                 WHERE NOT EXISTS (SELECT 1 FROM notes t WHERE t.title_key = l.target_key)",
            )
            .expect("prepares");
        let plan: Vec<String> = statement
            .query_map([], |row| row.get::<_, String>(3))
            .expect("runs")
            .collect::<Result<_, _>>()
            .expect("reads");

        assert!(
            plan.iter().any(|line| line.contains("idx_notes_title_key")),
            "plan was: {plan:?}"
        );
    }
}
