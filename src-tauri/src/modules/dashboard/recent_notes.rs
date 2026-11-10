use serde::{Deserialize, Serialize};
use specta::Type;

use super::repository;
use crate::error::AppResult;
use crate::state::AppState;
use crate::vault::links::extract;

pub const DEFAULT_RECENT_NOTES: u32 = 5;
pub const MAX_RECENT_NOTES: u32 = 20;
const EXCERPT_LENGTH: usize = 160;

#[derive(Debug, Clone, Default, Deserialize, Type)]
#[serde(rename_all = "camelCase", default)]
pub struct RecentNotesInput {
    pub limit: Option<u32>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct RecentNote {
    pub id: String,
    pub title: String,
    pub path: String,
    pub folder: Option<String>,
    pub excerpt: String,
    pub created_at: String,
    pub modified_at: String,
}

pub fn list(state: &AppState, input: RecentNotesInput) -> AppResult<Vec<RecentNote>> {
    let limit = input
        .limit
        .unwrap_or(DEFAULT_RECENT_NOTES)
        .clamp(1, MAX_RECENT_NOTES);
    let connection = state.database();
    let rows = repository::find_recent_notes(&connection, limit)?;
    Ok(rows
        .into_iter()
        .map(|row| RecentNote {
            folder: row
                .path
                .rsplit_once('/')
                .map(|(folder, _)| folder.to_string()),
            excerpt: excerpt(&row.body_prefix),
            id: row.id,
            title: row.title,
            path: row.path,
            created_at: row.created_at,
            modified_at: row.modified_at,
        })
        .collect())
}

pub fn excerpt(body: &str) -> String {
    let mut in_fence = false;
    let mut words: Vec<String> = Vec::new();
    for line in body.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("```") || trimmed.starts_with("~~~") {
            in_fence = !in_fence;
            continue;
        }
        let is_skipped = in_fence || trimmed.is_empty() || trimmed.starts_with('#');
        if is_skipped {
            continue;
        }
        let text = plain_text(trimmed);
        words.extend(
            text.split_whitespace()
                .map(|word| word.trim_matches('_'))
                .filter(|word| !word.is_empty())
                .map(str::to_string),
        );
        let has_enough = words
            .iter()
            .map(|word| word.chars().count() + 1)
            .sum::<usize>()
            > EXCERPT_LENGTH;
        if has_enough {
            break;
        }
    }
    truncate(&words.join(" "))
}

fn plain_text(line: &str) -> String {
    let without_links = replace_links(line);
    let without_marker = without_links
        .trim_start_matches(['>', ' '])
        .trim_start_matches(['-', '*', '+'])
        .trim_start();
    without_marker
        .chars()
        .filter(|character| !matches!(character, '*' | '`' | '~'))
        .collect()
}

fn replace_links(line: &str) -> String {
    let mut output = String::with_capacity(line.len());
    let mut cursor = 0;
    for link in extract(line) {
        output.push_str(&line[cursor..link.start]);
        output.push_str(link.alias.as_deref().unwrap_or(&link.target));
        cursor = link.end;
    }
    output.push_str(&line[cursor..]);
    output
}

fn truncate(text: &str) -> String {
    if text.chars().count() <= EXCERPT_LENGTH {
        return text.to_string();
    }
    let cut: String = text.chars().take(EXCERPT_LENGTH).collect();
    format!("{}…", cut.trim_end())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{connection::open_in_memory, migrations};
    use crate::modules::notes::models::{CreateNoteInput, SaveNoteInput};
    use crate::modules::notes::note_service as notes;
    use crate::modules::notes::vault_service::{SetupVaultInput, reindex, setup};
    use std::fs;
    use std::time::Duration;

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

    fn note(fixture: &Fixture, folder: Option<&str>, title: &str, body: &str) -> String {
        if let Some(folder) = folder {
            fs::create_dir_all(fixture.vault.path().join(folder)).expect("creates dir");
        }
        let created = notes::create(
            &fixture.state,
            CreateNoteInput {
                folder_path: folder.map(str::to_string),
                title: title.into(),
                content: Some(body.into()),
                tags: None,
            },
        )
        .expect("creates note");
        std::thread::sleep(Duration::from_millis(15));
        created.id
    }

    fn recent(fixture: &Fixture, limit: Option<u32>) -> Vec<RecentNote> {
        list(&fixture.state, RecentNotesInput { limit }).expect("lists")
    }

    fn titles(notes: &[RecentNote]) -> Vec<&str> {
        notes.iter().map(|note| note.title.as_str()).collect()
    }

    #[test]
    fn the_excerpt_skips_headings_blank_lines_and_code_fences() {
        let body = "# Title\n\nFirst paragraph here.\n\n## Section\n```\nlet hidden = 1;\n```\nSecond line.\n";

        assert_eq!(excerpt(body), "First paragraph here. Second line.");
    }

    #[test]
    fn links_show_their_text_and_markdown_noise_is_dropped() {
        let body = "> **Bold** and _italic_ with [[Spring Boot]], [[Note#Part]] and [[Target|an alias]] `code`\n- item one\n";

        assert_eq!(
            excerpt(body),
            "Bold and italic with Spring Boot, Note and an alias code item one"
        );
    }

    #[test]
    fn underscores_inside_words_survive_but_emphasis_underscores_do_not() {
        assert_eq!(
            excerpt("use snake_case and __init__ and _emphasis_"),
            "use snake_case and init and emphasis"
        );
    }

    #[test]
    fn long_text_is_cut_with_an_ellipsis_and_short_text_is_left_alone() {
        let long = "word ".repeat(100);
        let cut = excerpt(&long);

        assert!(cut.ends_with('…'));
        assert!(cut.chars().count() <= EXCERPT_LENGTH + 1);
        assert_eq!(excerpt("short text"), "short text");
        assert_eq!(excerpt(""), "");
        assert_eq!(excerpt("# only a heading\n"), "");
    }

    #[test]
    fn the_excerpt_cuts_on_character_boundaries_for_non_ascii_text() {
        let text = "ação ".repeat(80);

        let cut = excerpt(&text);

        assert!(cut.ends_with('…'));
        assert!(cut.chars().count() <= EXCERPT_LENGTH + 1);
    }

    #[test]
    fn notes_come_newest_first_with_title_folder_and_excerpt() {
        let fixture = fixture();
        note(&fixture, None, "Oldest", "# Oldest\nfirst body\n");
        note(
            &fixture,
            Some("Projects/Web"),
            "Middle",
            "# Middle\nmiddle body with [[Oldest]]\n",
        );
        let newest = note(&fixture, None, "Newest", "# Newest\nlatest body\n");

        let notes = recent(&fixture, None);

        assert_eq!(titles(&notes), ["Newest", "Middle", "Oldest"]);
        assert_eq!(notes[0].id, newest);
        assert_eq!(notes[0].folder, None);
        assert_eq!(notes[0].excerpt, "latest body");
        assert_eq!(notes[1].path, "Projects/Web/Middle.md");
        assert_eq!(notes[1].folder.as_deref(), Some("Projects/Web"));
        assert_eq!(notes[1].excerpt, "middle body with Oldest");
        assert!(notes[0].modified_at > notes[1].modified_at);
    }

    #[test]
    fn the_limit_defaults_to_five_and_is_clamped() {
        let fixture = fixture();
        for index in 0..25 {
            let title = format!("Note {index:02}");
            note(&fixture, None, &title, &format!("# {title}\nbody\n"));
        }

        assert_eq!(recent(&fixture, None).len(), 5);
        assert_eq!(recent(&fixture, Some(2)).len(), 2);
        assert_eq!(recent(&fixture, Some(0)).len(), 1);
        assert_eq!(recent(&fixture, Some(10_000)).len(), 20);
        assert_eq!(titles(&recent(&fixture, Some(2))), ["Note 24", "Note 23"]);
    }

    #[test]
    fn an_empty_vault_has_no_recent_notes() {
        let fixture = fixture();

        assert!(recent(&fixture, None).is_empty());
    }

    #[test]
    fn saving_a_note_brings_it_to_the_top_and_refreshes_its_excerpt() {
        let fixture = fixture();
        let first = note(&fixture, None, "First", "# First\nold text\n");
        note(&fixture, None, "Second", "# Second\nbody\n");
        assert_eq!(titles(&recent(&fixture, None)), ["Second", "First"]);

        let opened = notes::get(&fixture.state, &first).expect("reads");
        notes::save(
            &fixture.state,
            &first,
            SaveNoteInput {
                content: "# First\nbrand new text\n".into(),
                base_hash: opened.hash,
                tags: None,
                force: false,
            },
        )
        .expect("saves");

        let notes = recent(&fixture, None);
        assert_eq!(titles(&notes), ["First", "Second"]);
        assert_eq!(notes[0].excerpt, "brand new text");
    }

    #[test]
    fn renamed_moved_and_deleted_notes_are_reflected() {
        let fixture = fixture();
        let a = note(&fixture, None, "Alpha", "# Alpha\nbody\n");
        let b = note(&fixture, None, "Beta", "# Beta\nbody\n");
        fs::create_dir_all(fixture.vault.path().join("Archive")).expect("creates dir");

        notes::rename(&fixture.state, &a, "Alpha prime").expect("renames");
        notes::move_note(&fixture.state, &b, Some("Archive")).expect("moves");
        let after = recent(&fixture, None);
        assert!(titles(&after).contains(&"Alpha prime"));
        assert_eq!(
            after
                .iter()
                .find(|note| note.id == b)
                .and_then(|note| note.folder.as_deref()),
            Some("Archive")
        );

        notes::delete(&fixture.state, &a).expect("deletes");
        assert_eq!(titles(&recent(&fixture, None)), ["Beta"]);
    }

    #[test]
    fn a_note_edited_outside_the_app_moves_up_after_a_reindex() {
        let fixture = fixture();
        note(&fixture, None, "Stale", "# Stale\nbody\n");
        note(&fixture, None, "Fresh", "# Fresh\nbody\n");
        let stale_path = fixture.vault.path().join("Stale.md");
        let current = fs::read_to_string(&stale_path).expect("reads");
        std::thread::sleep(Duration::from_millis(20));
        fs::write(&stale_path, format!("{current}appended elsewhere\n")).expect("edits outside");

        reindex(&fixture.state).expect("reindexes");

        let notes = recent(&fixture, None);
        assert_eq!(titles(&notes), ["Stale", "Fresh"]);
        assert_eq!(notes[0].excerpt, "body appended elsewhere");
    }

    #[test]
    fn the_listing_is_driven_by_the_modification_index() {
        let fixture = fixture();

        let plan: Vec<String> = fixture
            .state
            .database()
            .prepare(
                "EXPLAIN QUERY PLAN SELECT id FROM notes ORDER BY modified_at DESC, path LIMIT 5",
            )
            .expect("prepares")
            .query_map([], |row| row.get::<_, String>(3))
            .expect("runs")
            .collect::<Result<_, _>>()
            .expect("reads");

        assert!(
            plan.iter().any(|line| line.contains("idx_notes_modified")),
            "plan was: {plan:?}"
        );
    }

    #[test]
    fn notes_without_a_search_entry_still_list_with_an_empty_excerpt() {
        let fixture = fixture();
        note(&fixture, None, "Orphan", "# Orphan\nbody\n");
        fixture
            .state
            .database()
            .execute_batch(
                "DELETE FROM search_index WHERE rowid IN (SELECT id FROM search_entries WHERE entity_type = 'note');
                 DELETE FROM search_entries WHERE entity_type = 'note';",
            )
            .expect("drops the search rows");

        let notes = recent(&fixture, None);

        assert_eq!(titles(&notes), ["Orphan"]);
        assert_eq!(notes[0].excerpt, "");
    }
}
