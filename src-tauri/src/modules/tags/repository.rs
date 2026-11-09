use rusqlite::{Connection, OptionalExtension, Row};

use super::models::Tag;
use crate::error::AppResult;

const TAG_SELECT: &str = "SELECT t.id, t.name, t.color, t.created_at, t.updated_at,
        (SELECT COUNT(*) FROM task_tags tt WHERE tt.tag_id = t.id)
     FROM tags t";

fn map_tag(row: &Row<'_>) -> rusqlite::Result<Tag> {
    Ok(Tag {
        id: row.get(0)?,
        name: row.get(1)?,
        color: row.get(2)?,
        created_at: row.get(3)?,
        updated_at: row.get(4)?,
        task_count: row.get(5)?,
    })
}

pub fn insert(connection: &Connection, tag: &Tag) -> AppResult<()> {
    connection.execute(
        "INSERT INTO tags (id, name, color, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5)",
        (
            &tag.id,
            &tag.name,
            &tag.color,
            &tag.created_at,
            &tag.updated_at,
        ),
    )?;
    Ok(())
}

pub fn find_by_id(connection: &Connection, id: &str) -> AppResult<Option<Tag>> {
    let sql = format!("{TAG_SELECT} WHERE t.id = ?1");
    let tag = connection.query_row(&sql, [id], map_tag).optional()?;
    Ok(tag)
}

/// Case-insensitive lookup, matching the unique index on `tags.name`.
pub fn find_id_by_name(connection: &Connection, name: &str) -> AppResult<Option<String>> {
    let id = connection
        .query_row(
            "SELECT id FROM tags WHERE name = ?1 COLLATE NOCASE",
            [name],
            |row| row.get(0),
        )
        .optional()?;
    Ok(id)
}

pub fn list_all(connection: &Connection) -> AppResult<Vec<Tag>> {
    let sql = format!("{TAG_SELECT} ORDER BY t.name COLLATE NOCASE, t.id");
    let mut statement = connection.prepare(&sql)?;
    let rows = statement.query_map([], map_tag)?;
    let tags = rows.collect::<Result<Vec<_>, _>>()?;
    Ok(tags)
}

pub fn list_by_task(connection: &Connection, task_id: &str) -> AppResult<Vec<Tag>> {
    let sql = format!(
        "{TAG_SELECT} JOIN task_tags link ON link.tag_id = t.id
         WHERE link.task_id = ?1 ORDER BY t.name COLLATE NOCASE, t.id"
    );
    let mut statement = connection.prepare(&sql)?;
    let rows = statement.query_map([task_id], map_tag)?;
    let tags = rows.collect::<Result<Vec<_>, _>>()?;
    Ok(tags)
}

pub fn update(connection: &Connection, tag: &Tag) -> AppResult<usize> {
    let affected = connection.execute(
        "UPDATE tags SET name = ?2, color = ?3, updated_at = ?4 WHERE id = ?1",
        (&tag.id, &tag.name, &tag.color, &tag.updated_at),
    )?;
    Ok(affected)
}

pub fn delete(connection: &Connection, id: &str) -> AppResult<usize> {
    let affected = connection.execute("DELETE FROM tags WHERE id = ?1", [id])?;
    Ok(affected)
}

pub fn assign(connection: &Connection, task_id: &str, tag_id: &str) -> AppResult<usize> {
    let affected = connection.execute(
        "INSERT OR IGNORE INTO task_tags (task_id, tag_id) VALUES (?1, ?2)",
        (task_id, tag_id),
    )?;
    Ok(affected)
}

pub fn unassign(connection: &Connection, task_id: &str, tag_id: &str) -> AppResult<usize> {
    let affected = connection.execute(
        "DELETE FROM task_tags WHERE task_id = ?1 AND tag_id = ?2",
        (task_id, tag_id),
    )?;
    Ok(affected)
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
                "INSERT INTO projects (id, name, created_at, updated_at) VALUES ('p1', 'P', 'x', 'x');
                 INSERT INTO tasks (id, project_id, title, position, created_at, updated_at) VALUES ('t1', 'p1', 'T', 'V', 'x', 'x');
                 INSERT INTO tasks (id, project_id, title, position, created_at, updated_at) VALUES ('t2', 'p1', 'T2', 'W', 'x', 'x');",
            )
            .expect("seeds");
        connection
    }

    fn tag(id: &str, name: &str) -> Tag {
        Tag {
            id: id.into(),
            name: name.into(),
            color: Some("#112233".into()),
            created_at: NOW.into(),
            updated_at: NOW.into(),
            task_count: 0,
        }
    }

    #[test]
    fn insert_then_find_round_trips_every_field() {
        let connection = migrated_connection();
        let original = tag("g1", "bug");

        insert(&connection, &original).expect("inserts");

        assert_eq!(
            find_by_id(&connection, "g1").expect("reads"),
            Some(original)
        );
        assert_eq!(find_by_id(&connection, "ghost").expect("reads"), None);
    }

    #[test]
    fn name_lookup_ignores_case_and_the_index_rejects_duplicates() {
        let connection = migrated_connection();
        insert(&connection, &tag("g1", "Bug")).expect("inserts");

        let found = find_id_by_name(&connection, "bUG").expect("reads");
        let duplicate = insert(&connection, &tag("g2", "BUG"));

        assert_eq!(found.as_deref(), Some("g1"));
        assert!(duplicate.is_err());
    }

    #[test]
    fn list_is_alphabetical_ignoring_case_and_counts_assignments() {
        let connection = migrated_connection();
        insert(&connection, &tag("g1", "beta")).expect("inserts");
        insert(&connection, &tag("g2", "Alpha")).expect("inserts");
        assign(&connection, "t1", "g1").expect("assigns");
        assign(&connection, "t2", "g1").expect("assigns");

        let listed = list_all(&connection).expect("lists");

        let summary: Vec<(&str, u32)> = listed
            .iter()
            .map(|tag| (tag.name.as_str(), tag.task_count))
            .collect();
        assert_eq!(summary, [("Alpha", 0), ("beta", 2)]);
    }

    #[test]
    fn assign_is_idempotent_and_unassign_reports_whether_it_removed_anything() {
        let connection = migrated_connection();
        insert(&connection, &tag("g1", "bug")).expect("inserts");

        let first = assign(&connection, "t1", "g1").expect("assigns");
        let again = assign(&connection, "t1", "g1").expect("assigns");
        let removed = unassign(&connection, "t1", "g1").expect("unassigns");
        let removed_again = unassign(&connection, "t1", "g1").expect("unassigns");

        assert_eq!((first, again, removed, removed_again), (1, 0, 1, 0));
    }

    #[test]
    fn list_by_task_returns_only_that_tasks_tags() {
        let connection = migrated_connection();
        insert(&connection, &tag("g1", "b")).expect("inserts");
        insert(&connection, &tag("g2", "a")).expect("inserts");
        insert(&connection, &tag("g3", "c")).expect("inserts");
        assign(&connection, "t1", "g1").expect("assigns");
        assign(&connection, "t1", "g2").expect("assigns");
        assign(&connection, "t2", "g3").expect("assigns");

        let names: Vec<String> = list_by_task(&connection, "t1")
            .expect("lists")
            .into_iter()
            .map(|tag| tag.name)
            .collect();

        assert_eq!(names, ["a", "b"]);
    }

    #[test]
    fn update_and_delete_report_affected_rows_and_delete_cascades_assignments() {
        let connection = migrated_connection();
        insert(&connection, &tag("g1", "bug")).expect("inserts");
        assign(&connection, "t1", "g1").expect("assigns");
        let mut changed = tag("g1", "defect");
        changed.color = None;

        let updated = update(&connection, &changed).expect("updates");
        let reloaded = find_by_id(&connection, "g1")
            .expect("reads")
            .expect("exists");
        let deleted = delete(&connection, "g1").expect("deletes");
        let deleted_again = delete(&connection, "g1").expect("deletes");
        let links: i64 = connection
            .query_row("SELECT COUNT(*) FROM task_tags", [], |row| row.get(0))
            .expect("counts");

        assert_eq!((updated, deleted, deleted_again, links), (1, 1, 0, 0));
        assert_eq!(reloaded.name, "defect");
        assert_eq!(reloaded.color, None);
    }
}
