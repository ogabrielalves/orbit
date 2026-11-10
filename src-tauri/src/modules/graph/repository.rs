use rusqlite::Connection;

use crate::error::AppResult;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RawEdge {
    pub source_id: String,
    pub target_id: Option<String>,
    pub target_key: String,
    pub target_title: String,
    pub link_count: u32,
}

pub fn list_edges(connection: &Connection) -> AppResult<Vec<RawEdge>> {
    let mut statement = connection.prepare(
        "SELECT l.source_note_id,
                (SELECT t.id FROM notes t WHERE t.title_key = l.target_key
                 ORDER BY t.created_at, t.path LIMIT 1),
                l.target_key, l.target_title, l.link_count
         FROM note_links l
         ORDER BY l.source_note_id, l.target_key",
    )?;
    let rows = statement.query_map([], |row| {
        Ok(RawEdge {
            source_id: row.get(0)?,
            target_id: row.get(1)?,
            target_key: row.get(2)?,
            target_title: row.get(3)?,
            link_count: row.get(4)?,
        })
    })?;
    let edges = rows.collect::<Result<Vec<_>, _>>()?;
    Ok(edges)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{connection::open_in_memory, migrations};
    use crate::modules::notes::models::{LinkRecord, NoteRecord};
    use crate::modules::notes::repository as notes;

    fn migrated_connection() -> Connection {
        let mut connection = open_in_memory().expect("opens");
        migrations::run(&mut connection).expect("migrates");
        connection
    }

    fn note(id: &str, title_key: &str, created_at: &str) -> NoteRecord {
        NoteRecord {
            id: id.into(),
            path: format!("{id}.md"),
            title: title_key.to_uppercase(),
            title_key: title_key.into(),
            hash: "a".repeat(64),
            created_at: created_at.into(),
            modified_at: created_at.into(),
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
    fn edges_carry_their_resolution_or_none_for_unresolved_titles() {
        let connection = migrated_connection();
        notes::insert(&connection, &note("a", "alpha", "2026-11-01T00:00:00.000Z"))
            .expect("inserts");
        notes::insert(&connection, &note("b", "beta", "2026-11-01T00:00:00.000Z"))
            .expect("inserts");
        notes::replace_links(&connection, "a", &[link("beta", 2), link("ghost", 1)])
            .expect("links");

        let edges = list_edges(&connection).expect("lists");

        let summary: Vec<(&str, Option<&str>, &str, u32)> = edges
            .iter()
            .map(|edge| {
                (
                    edge.source_id.as_str(),
                    edge.target_id.as_deref(),
                    edge.target_key.as_str(),
                    edge.link_count,
                )
            })
            .collect();
        assert_eq!(
            summary,
            [("a", Some("b"), "beta", 2), ("a", None, "ghost", 1)]
        );
    }

    #[test]
    fn a_shared_title_resolves_to_the_oldest_note() {
        let connection = migrated_connection();
        notes::insert(
            &connection,
            &note("new", "twin", "2026-11-09T00:00:00.000Z"),
        )
        .expect("inserts");
        notes::insert(
            &connection,
            &note("old", "twin", "2026-11-01T00:00:00.000Z"),
        )
        .expect("inserts");
        notes::insert(&connection, &note("src", "src", "2026-11-05T00:00:00.000Z"))
            .expect("inserts");
        notes::replace_links(&connection, "src", &[link("twin", 1)]).expect("links");

        let edges = list_edges(&connection).expect("lists");

        assert_eq!(edges[0].target_id.as_deref(), Some("old"));
    }

    #[test]
    fn there_are_no_edges_without_links() {
        let connection = migrated_connection();
        notes::insert(&connection, &note("a", "alpha", "2026-11-01T00:00:00.000Z"))
            .expect("inserts");

        assert!(list_edges(&connection).expect("lists").is_empty());
    }
}
