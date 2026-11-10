use rusqlite::{Connection, Row};

use crate::error::AppResult;

pub const NOTE: &str = "note";
pub const FOLDER: &str = "folder";

pub const MATCH_START: char = '\u{1}';
pub const MATCH_END: char = '\u{2}';

const TITLE_AND_SNIPPET: &str = "highlight(search_index, 0, char(1), char(2)),
     snippet(search_index, 1, char(1), char(2), '…', 14)";
const RANK: &str = "bm25(search_index, 10.0, 1.0)";

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct RawHit {
    pub entity_id: String,
    pub title: String,
    pub snippet: String,
    pub context: Option<String>,
    pub project_id: Option<String>,
    pub board_id: Option<String>,
    pub parent_task_id: Option<String>,
    pub path: Option<String>,
}

fn base(row: &Row<'_>) -> rusqlite::Result<RawHit> {
    Ok(RawHit {
        entity_id: row.get(0)?,
        title: row.get(1)?,
        snippet: row.get(2)?,
        ..RawHit::default()
    })
}

pub fn upsert_entry(
    connection: &Connection,
    entity_type: &str,
    entity_id: &str,
    title: &str,
    body: &str,
) -> AppResult<()> {
    connection.execute(
        "INSERT OR IGNORE INTO search_entries (entity_type, entity_id) VALUES (?1, ?2)",
        (entity_type, entity_id),
    )?;
    let rowid: i64 = connection.query_row(
        "SELECT id FROM search_entries WHERE entity_type = ?1 AND entity_id = ?2",
        (entity_type, entity_id),
        |row| row.get(0),
    )?;
    connection.execute("DELETE FROM search_index WHERE rowid = ?1", [rowid])?;
    connection.execute(
        "INSERT INTO search_index (rowid, title, body) VALUES (?1, ?2, ?3)",
        (rowid, title, body),
    )?;
    Ok(())
}

pub fn has_entry(connection: &Connection, entity_type: &str, entity_id: &str) -> AppResult<bool> {
    let exists = connection.query_row(
        "SELECT EXISTS(SELECT 1 FROM search_entries WHERE entity_type = ?1 AND entity_id = ?2)",
        (entity_type, entity_id),
        |row| row.get(0),
    )?;
    Ok(exists)
}

pub fn replace_folders(connection: &Connection, paths: &[String]) -> AppResult<()> {
    connection.execute(
        "DELETE FROM search_index
         WHERE rowid IN (SELECT id FROM search_entries WHERE entity_type = 'folder')",
        [],
    )?;
    connection.execute(
        "DELETE FROM search_entries WHERE entity_type = 'folder'",
        [],
    )?;
    for path in paths {
        let name = path
            .rsplit_once('/')
            .map_or(path.as_str(), |(_, name)| name);
        upsert_entry(connection, FOLDER, path, name, path)?;
    }
    Ok(())
}

pub fn search_projects(
    connection: &Connection,
    expression: &str,
    limit: u32,
) -> AppResult<Vec<RawHit>> {
    let sql = format!(
        "SELECT e.entity_id, {TITLE_AND_SNIPPET}
         FROM search_index
         JOIN search_entries e ON e.id = search_index.rowid AND e.entity_type = 'project'
         JOIN projects p ON p.id = e.entity_id
         WHERE search_index MATCH ?1 AND p.archived_at IS NULL
         ORDER BY {RANK} LIMIT ?2"
    );
    run(connection, &sql, expression, limit, base)
}

pub fn search_boards(
    connection: &Connection,
    expression: &str,
    limit: u32,
) -> AppResult<Vec<RawHit>> {
    let sql = format!(
        "SELECT e.entity_id, {TITLE_AND_SNIPPET}, b.project_id, p.name
         FROM search_index
         JOIN search_entries e ON e.id = search_index.rowid AND e.entity_type = 'board'
         JOIN boards b ON b.id = e.entity_id
         JOIN projects p ON p.id = b.project_id
         WHERE search_index MATCH ?1 AND b.archived_at IS NULL AND p.archived_at IS NULL
         ORDER BY {RANK} LIMIT ?2"
    );
    run(connection, &sql, expression, limit, |row| {
        Ok(RawHit {
            project_id: row.get(3)?,
            context: row.get(4)?,
            board_id: row.get(0)?,
            ..base(row)?
        })
    })
}

pub fn search_tasks(
    connection: &Connection,
    expression: &str,
    limit: u32,
) -> AppResult<Vec<RawHit>> {
    let sql = format!(
        "SELECT e.entity_id, {TITLE_AND_SNIPPET}, t.project_id, t.board_id, t.parent_task_id, p.name
         FROM search_index
         JOIN search_entries e ON e.id = search_index.rowid AND e.entity_type = 'task'
         JOIN tasks t ON t.id = e.entity_id
         JOIN projects p ON p.id = t.project_id
         LEFT JOIN boards b ON b.id = t.board_id
         LEFT JOIN tasks parent ON parent.id = t.parent_task_id
         WHERE search_index MATCH ?1
           AND t.archived_at IS NULL AND p.archived_at IS NULL
           AND (t.board_id IS NULL OR b.archived_at IS NULL)
           AND (t.parent_task_id IS NULL OR parent.archived_at IS NULL)
         ORDER BY {RANK} LIMIT ?2"
    );
    run(connection, &sql, expression, limit, |row| {
        Ok(RawHit {
            project_id: row.get(3)?,
            board_id: row.get(4)?,
            parent_task_id: row.get(5)?,
            context: row.get(6)?,
            ..base(row)?
        })
    })
}

pub fn search_notes(
    connection: &Connection,
    expression: &str,
    limit: u32,
) -> AppResult<Vec<RawHit>> {
    let sql = format!(
        "SELECT e.entity_id, {TITLE_AND_SNIPPET}, n.path
         FROM search_index
         JOIN search_entries e ON e.id = search_index.rowid AND e.entity_type = 'note'
         JOIN notes n ON n.id = e.entity_id
         WHERE search_index MATCH ?1
         ORDER BY {RANK} LIMIT ?2"
    );
    run(connection, &sql, expression, limit, |row| {
        let path: String = row.get(3)?;
        let folder = path.rsplit_once('/').map(|(folder, _)| folder.to_string());
        Ok(RawHit {
            context: folder,
            path: Some(path),
            ..base(row)?
        })
    })
}

pub fn search_folders(
    connection: &Connection,
    expression: &str,
    limit: u32,
) -> AppResult<Vec<RawHit>> {
    let sql = format!(
        "SELECT e.entity_id, {TITLE_AND_SNIPPET}
         FROM search_index
         JOIN search_entries e ON e.id = search_index.rowid AND e.entity_type = 'folder'
         WHERE search_index MATCH ?1
         ORDER BY {RANK} LIMIT ?2"
    );
    run(connection, &sql, expression, limit, |row| {
        let hit = base(row)?;
        let folder = hit
            .entity_id
            .rsplit_once('/')
            .map(|(parent, _)| parent.to_string());
        Ok(RawHit {
            context: folder,
            path: Some(hit.entity_id.clone()),
            ..hit
        })
    })
}

fn run(
    connection: &Connection,
    sql: &str,
    expression: &str,
    limit: u32,
    map: impl Fn(&Row<'_>) -> rusqlite::Result<RawHit>,
) -> AppResult<Vec<RawHit>> {
    let mut statement = connection.prepare(sql)?;
    let rows = statement.query_map((expression, limit), |row| map(row))?;
    let hits = rows.collect::<Result<Vec<_>, _>>()?;
    Ok(hits)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{connection::open_in_memory, migrations};

    fn migrated_connection() -> Connection {
        let mut connection = open_in_memory().expect("opens");
        migrations::run(&mut connection).expect("migrates");
        connection
    }

    fn insert_note_row(connection: &Connection, id: &str, path: &str) {
        connection
            .execute(
                "INSERT INTO notes (id, path, title, title_key, hash, created_at, modified_at)
                 VALUES (?1, ?2, ?1, ?1, ?3, 'x', 'x')",
                (id, path, "a".repeat(64)),
            )
            .expect("note");
    }

    #[test]
    fn upserting_twice_replaces_the_text_and_keeps_one_entry() {
        let connection = migrated_connection();
        insert_note_row(&connection, "n1", "dir/a.md");

        upsert_entry(&connection, NOTE, "n1", "First title", "alpha words").expect("upserts");
        upsert_entry(&connection, NOTE, "n1", "Second title", "beta words").expect("upserts");

        assert!(
            search_notes(&connection, "\"alpha\"*", 10)
                .expect("searches")
                .is_empty()
        );
        let hits = search_notes(&connection, "\"beta\"*", 10).expect("searches");
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].entity_id, "n1");
        let entries: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM search_entries WHERE entity_type = 'note'",
                [],
                |row| row.get(0),
            )
            .expect("counts");
        assert_eq!(entries, 1);
    }

    #[test]
    fn has_entry_tells_indexed_from_unindexed_entities() {
        let connection = migrated_connection();
        upsert_entry(&connection, NOTE, "n1", "T", "b").expect("upserts");

        assert!(has_entry(&connection, NOTE, "n1").expect("reads"));
        assert!(!has_entry(&connection, NOTE, "n2").expect("reads"));
        assert!(!has_entry(&connection, FOLDER, "n1").expect("reads"));
    }

    #[test]
    fn note_hits_carry_the_path_and_the_folder_as_context() {
        let connection = migrated_connection();
        insert_note_row(&connection, "n1", "Projects/Web/plan.md");
        insert_note_row(&connection, "n2", "root.md");
        upsert_entry(&connection, NOTE, "n1", "Plan", "roadmap items").expect("upserts");
        upsert_entry(&connection, NOTE, "n2", "Root", "roadmap too").expect("upserts");

        let mut hits = search_notes(&connection, "\"roadmap\"*", 10).expect("searches");
        hits.sort_by(|a, b| a.entity_id.cmp(&b.entity_id));

        assert_eq!(hits[0].path.as_deref(), Some("Projects/Web/plan.md"));
        assert_eq!(hits[0].context.as_deref(), Some("Projects/Web"));
        assert_eq!(hits[1].path.as_deref(), Some("root.md"));
        assert_eq!(hits[1].context, None);
    }

    #[test]
    fn replacing_folders_swaps_the_whole_set_and_uses_the_name_as_title() {
        let connection = migrated_connection();
        replace_folders(
            &connection,
            &["Projects".into(), "Projects/Web design".into()],
        )
        .expect("replaces");

        let by_name = search_folders(&connection, "\"design\"*", 10).expect("searches");
        let by_parent = search_folders(&connection, "\"projects\"*", 10).expect("searches");
        replace_folders(&connection, &["Archive".into()]).expect("replaces again");
        let after = search_folders(&connection, "\"design\"*", 10).expect("searches");

        assert_eq!(by_name.len(), 1);
        assert_eq!(by_name[0].path.as_deref(), Some("Projects/Web design"));
        assert_eq!(by_name[0].context.as_deref(), Some("Projects"));
        assert_eq!(by_parent.len(), 2);
        assert!(after.is_empty());
        assert_eq!(
            search_folders(&connection, "\"archive\"*", 10)
                .expect("searches")
                .len(),
            1
        );
    }

    #[test]
    fn matches_are_wrapped_in_the_marker_characters() {
        let connection = migrated_connection();
        insert_note_row(&connection, "n1", "a.md");
        upsert_entry(
            &connection,
            NOTE,
            "n1",
            "Spring Boot",
            "uses hibernate for persistence",
        )
        .expect("upserts");

        let hits = search_notes(&connection, "\"hibernate\"*", 10).expect("searches");

        assert!(
            hits[0]
                .snippet
                .contains(&format!("{MATCH_START}hibernate{MATCH_END}"))
        );
        let by_title = search_notes(&connection, "\"spring\"*", 10).expect("searches");
        assert!(by_title[0].title.starts_with(MATCH_START));
    }

    #[test]
    fn a_title_match_ranks_above_a_body_only_match_and_the_limit_applies() {
        let connection = migrated_connection();
        for id in ["body", "title", "other"] {
            insert_note_row(&connection, id, &format!("{id}.md"));
        }
        upsert_entry(
            &connection,
            NOTE,
            "body",
            "Something else",
            "kafka is mentioned here",
        )
        .expect("upserts");
        upsert_entry(&connection, NOTE, "title", "Kafka", "streams").expect("upserts");
        upsert_entry(&connection, NOTE, "other", "Kafka again", "more").expect("upserts");

        let all = search_notes(&connection, "\"kafka\"*", 10).expect("searches");
        let limited = search_notes(&connection, "\"kafka\"*", 1).expect("searches");

        assert_eq!(all.len(), 3);
        assert_eq!(all.last().map(|hit| hit.entity_id.as_str()), Some("body"));
        assert_eq!(limited.len(), 1);
    }
}
