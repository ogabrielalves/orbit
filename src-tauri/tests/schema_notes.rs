mod common;

use common::{NOW, count, migrated_connection, query_plan};
use rusqlite::Connection;

const HASH: &str = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

fn insert_note(connection: &Connection, id: &str, path: &str) -> rusqlite::Result<usize> {
    connection.execute(
        "INSERT INTO notes (id, path, title, title_key, hash, created_at, modified_at)
         VALUES (?1, ?2, 'Title', 'title', ?3, ?4, ?4)",
        (id, path, HASH, NOW),
    )
}

fn insert_link(connection: &Connection, source: &str, key: &str) -> rusqlite::Result<usize> {
    connection.execute(
        "INSERT INTO note_links (source_note_id, target_key, target_title) VALUES (?1, ?2, ?2)",
        (source, key),
    )
}

#[test]
fn a_note_round_trips_and_defaults_are_sane() {
    let connection = migrated_connection();

    insert_note(&connection, "n1", "Folder/Note.md").expect("inserts");

    let (path, title_key): (String, String) = connection
        .query_row(
            "SELECT path, title_key FROM notes WHERE id = 'n1'",
            [],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .expect("reads");
    assert_eq!(
        (path.as_str(), title_key.as_str()),
        ("Folder/Note.md", "title")
    );
}

#[test]
fn paths_must_be_unique_relative_forward_slashed_markdown_files() {
    let connection = migrated_connection();
    insert_note(&connection, "n1", "a.md").expect("inserts");

    assert!(
        insert_note(&connection, "n2", "a.md").is_err(),
        "duplicate path"
    );
    assert!(
        insert_note(&connection, "n3", "/abs.md").is_err(),
        "absolute path"
    );
    assert!(
        insert_note(&connection, "n4", "dir\\note.md").is_err(),
        "backslash"
    );
    assert!(
        insert_note(&connection, "n5", "note.txt").is_err(),
        "not markdown"
    );
    assert!(insert_note(&connection, "n6", "  ").is_err(), "blank path");
    assert!(
        insert_note(&connection, "n7", "Upper.MD").is_ok(),
        "extension case"
    );
}

#[test]
fn notes_reject_blank_ids_titles_keys_and_malformed_hashes() {
    let connection = migrated_connection();
    let attempt = |id: &str, title: &str, key: &str, hash: &str| {
        connection.execute(
            "INSERT INTO notes (id, path, title, title_key, hash, created_at, modified_at)
             VALUES (?1, ?1 || '.md', ?2, ?3, ?4, ?5, ?5)",
            (id, title, key, hash, NOW),
        )
    };

    assert!(attempt("ok", "T", "t", HASH).is_ok());
    assert!(attempt("", "T", "t", HASH).is_err(), "empty id");
    assert!(attempt("a", "  ", "t", HASH).is_err(), "blank title");
    assert!(attempt("b", "T", "", HASH).is_err(), "empty title key");
    assert!(attempt("c", "T", "t", "abc").is_err(), "short hash");
}

#[test]
fn note_ids_are_unique() {
    let connection = migrated_connection();
    insert_note(&connection, "n1", "a.md").expect("inserts");

    assert!(insert_note(&connection, "n1", "b.md").is_err());
}

#[test]
fn links_need_an_existing_source_and_are_unique_per_source_and_target() {
    let connection = migrated_connection();
    insert_note(&connection, "n1", "a.md").expect("inserts");

    assert!(
        insert_link(&connection, "ghost", "x").is_err(),
        "unknown source"
    );
    assert!(insert_link(&connection, "n1", "x").is_ok());
    assert!(
        insert_link(&connection, "n1", "x").is_err(),
        "duplicate edge"
    );
    assert!(insert_link(&connection, "n1", "y").is_ok());
}

#[test]
fn links_reject_blank_targets_and_a_zero_count() {
    let connection = migrated_connection();
    insert_note(&connection, "n1", "a.md").expect("inserts");

    let blank_key = connection.execute(
        "INSERT INTO note_links (source_note_id, target_key, target_title) VALUES ('n1', '', 'x')",
        [],
    );
    let blank_title = connection.execute(
        "INSERT INTO note_links (source_note_id, target_key, target_title) VALUES ('n1', 'x', '  ')",
        [],
    );
    let zero_count = connection.execute(
        "INSERT INTO note_links (source_note_id, target_key, target_title, link_count) VALUES ('n1', 'x', 'x', 0)",
        [],
    );

    assert!(blank_key.is_err());
    assert!(blank_title.is_err());
    assert!(zero_count.is_err());
}

#[test]
fn deleting_a_note_deletes_its_outgoing_links_but_keeps_links_pointing_at_it() {
    let connection = migrated_connection();
    insert_note(&connection, "a", "a.md").expect("inserts");
    insert_note(&connection, "b", "b.md").expect("inserts");
    insert_link(&connection, "a", "title").expect("link a -> title");
    insert_link(&connection, "b", "title").expect("link b -> title");

    connection
        .execute("DELETE FROM notes WHERE id = 'a'", [])
        .expect("deletes");

    assert_eq!(count(&connection, "note_links"), 1);
}

#[test]
fn backlinks_and_resolution_queries_use_indexes() {
    let connection = migrated_connection();

    let backlinks = query_plan(
        &connection,
        "SELECT source_note_id FROM note_links WHERE target_key = 'x'",
    );
    let resolve = query_plan(
        &connection,
        "SELECT id FROM notes WHERE title_key = 'x' ORDER BY created_at LIMIT 1",
    );
    let outgoing = query_plan(
        &connection,
        "SELECT target_key FROM note_links WHERE source_note_id = 'x'",
    );
    let subtree = query_plan(
        &connection,
        "SELECT id FROM notes WHERE path >= 'dir/' AND path < 'dir0'",
    );

    assert!(
        backlinks.contains("idx_note_links_target"),
        "plan was: {backlinks}"
    );
    assert!(
        resolve.contains("idx_notes_title_key"),
        "plan was: {resolve}"
    );
    assert!(outgoing.contains("PRIMARY KEY"), "plan was: {outgoing}");
    assert!(
        subtree.contains("sqlite_autoindex_notes"),
        "plan was: {subtree}"
    );
}
