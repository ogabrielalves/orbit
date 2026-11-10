use super::models::{
    DEFAULT_LIMIT_PER_CATEGORY, MAX_LIMIT_PER_CATEGORY, SearchHit, SearchInput, SearchResults,
    TextPart,
};
use super::repository::{self, MATCH_END, MATCH_START, RawHit};
use crate::error::AppResult;
use crate::state::AppState;

const MAX_TERMS: usize = 8;
const MAX_TERM_LENGTH: usize = 50;

pub fn search(state: &AppState, input: SearchInput) -> AppResult<SearchResults> {
    let Some(expression) = match_expression(&input.query) else {
        return Ok(SearchResults::default());
    };
    let limit = input
        .limit_per_category
        .unwrap_or(DEFAULT_LIMIT_PER_CATEGORY)
        .clamp(1, MAX_LIMIT_PER_CATEGORY);

    let connection = state.database();
    Ok(SearchResults {
        projects: hits(repository::search_projects(
            &connection,
            &expression,
            limit,
        )?),
        boards: hits(repository::search_boards(&connection, &expression, limit)?),
        tasks: hits(repository::search_tasks(&connection, &expression, limit)?),
        notes: hits(repository::search_notes(&connection, &expression, limit)?),
        folders: hits(repository::search_folders(&connection, &expression, limit)?),
    })
}

pub fn match_expression(query: &str) -> Option<String> {
    let terms: Vec<String> = query
        .split(|character: char| !character.is_alphanumeric())
        .filter(|term| !term.is_empty())
        .take(MAX_TERMS)
        .map(|term| term.chars().take(MAX_TERM_LENGTH).collect::<String>())
        .map(|term| format!("\"{term}\"*"))
        .collect();
    let has_terms = !terms.is_empty();
    has_terms.then(|| terms.join(" "))
}

fn hits(raw: Vec<RawHit>) -> Vec<SearchHit> {
    raw.into_iter()
        .map(|hit| SearchHit {
            entity_id: hit.entity_id,
            title: parts(&hit.title),
            snippet: parts(&hit.snippet),
            context: hit.context,
            project_id: hit.project_id,
            board_id: hit.board_id,
            parent_task_id: hit.parent_task_id,
            path: hit.path,
        })
        .collect()
}

pub fn parts(marked: &str) -> Vec<TextPart> {
    let mut result: Vec<TextPart> = Vec::new();
    let mut current = String::new();
    let mut is_match = false;
    for character in marked.chars() {
        let toggles = character == MATCH_START || character == MATCH_END;
        if !toggles {
            current.push(character);
            continue;
        }
        if !current.is_empty() {
            result.push(TextPart {
                text: std::mem::take(&mut current),
                is_match,
            });
        }
        is_match = character == MATCH_START;
    }
    if !current.is_empty() {
        result.push(TextPart {
            text: current,
            is_match,
        });
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{connection::open_in_memory, migrations};
    use crate::modules::boards::models::{ColumnKind, CreateBoardInput, NewColumn};
    use crate::modules::boards::service as boards;
    use crate::modules::folders::models::CreateFolderInput;
    use crate::modules::folders::service as folders;
    use crate::modules::notes::models::{CreateNoteInput, SaveNoteInput};
    use crate::modules::notes::note_service as notes;
    use crate::modules::notes::vault_service::{SetupVaultInput, reindex, setup};
    use crate::modules::projects::models::{CreateProjectInput, UpdateProjectInput};
    use crate::modules::projects::service as projects;
    use crate::modules::tasks::models::{CreateSubtaskInput, CreateTaskInput, UpdateTaskInput};
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

    fn find(fixture: &Fixture, query: &str) -> SearchResults {
        search(
            &fixture.state,
            SearchInput {
                query: query.into(),
                limit_per_category: None,
            },
        )
        .expect("searches")
    }

    fn ids(hits: &[SearchHit]) -> Vec<&str> {
        hits.iter().map(|hit| hit.entity_id.as_str()).collect()
    }

    fn text(parts: &[TextPart]) -> String {
        parts.iter().map(|part| part.text.as_str()).collect()
    }

    fn matched(parts: &[TextPart]) -> Vec<&str> {
        parts
            .iter()
            .filter(|part| part.is_match)
            .map(|part| part.text.as_str())
            .collect()
    }

    fn project(fixture: &Fixture, name: &str, description: &str) -> String {
        projects::create(
            &fixture.state,
            CreateProjectInput {
                name: name.into(),
                description: Some(description.into()),
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

    fn task(fixture: &Fixture, project_id: &str, title: &str, description: &str) -> String {
        tasks::create(
            &fixture.state,
            CreateTaskInput {
                project_id: project_id.into(),
                title: title.into(),
                description: Some(description.into()),
                priority: None,
                due_date: None,
                column_id: None,
            },
        )
        .expect("creates task")
        .id
    }

    fn note(fixture: &Fixture, title: &str, body: &str) -> String {
        notes::create(
            &fixture.state,
            CreateNoteInput {
                folder_path: None,
                title: title.into(),
                content: Some(body.into()),
                tags: None,
            },
        )
        .expect("creates note")
        .id
    }

    #[test]
    fn every_word_becomes_a_quoted_prefix_term() {
        assert_eq!(
            match_expression("spring boot").as_deref(),
            Some("\"spring\"* \"boot\"*")
        );
        assert_eq!(
            match_expression("  one   two  ").as_deref(),
            Some("\"one\"* \"two\"*")
        );
        assert_eq!(match_expression("ação").as_deref(), Some("\"ação\"*"));
        assert_eq!(match_expression("日本語").as_deref(), Some("\"日本語\"*"));
    }

    #[test]
    fn operators_quotes_columns_and_punctuation_cannot_reach_the_query_syntax() {
        assert_eq!(
            match_expression("title:foo AND NOT (bar OR \"baz\") * ^ -x").as_deref(),
            Some("\"title\"* \"foo\"* \"AND\"* \"NOT\"* \"bar\"* \"OR\"* \"baz\"* \"x\"*")
        );
        assert_eq!(
            match_expression("NEAR(a b)").as_deref(),
            Some("\"NEAR\"* \"a\"* \"b\"*")
        );
    }

    #[test]
    fn nothing_searchable_means_no_expression() {
        for empty in ["", "   ", "***", "\"\"", "()-+*^:", "\n\t"] {
            assert_eq!(match_expression(empty), None, "{empty:?}");
        }
    }

    #[test]
    fn the_number_and_length_of_terms_are_capped() {
        let many = (0..20)
            .map(|i| format!("w{i}"))
            .collect::<Vec<_>>()
            .join(" ");
        let expression = match_expression(&many).expect("expression");
        let long = match_expression(&"x".repeat(500)).expect("expression");

        assert_eq!(expression.matches('*').count(), MAX_TERMS);
        assert_eq!(long.matches('x').count(), MAX_TERM_LENGTH);
    }

    #[test]
    fn marked_text_is_split_into_plain_and_matched_parts() {
        let marked = format!("see {MATCH_START}spring{MATCH_END} {MATCH_START}boot{MATCH_END}!");

        let split = parts(&marked);

        assert_eq!(
            split,
            [
                TextPart {
                    text: "see ".into(),
                    is_match: false
                },
                TextPart {
                    text: "spring".into(),
                    is_match: true
                },
                TextPart {
                    text: " ".into(),
                    is_match: false
                },
                TextPart {
                    text: "boot".into(),
                    is_match: true
                },
                TextPart {
                    text: "!".into(),
                    is_match: false
                },
            ]
        );
        assert!(parts("").is_empty());
        assert_eq!(
            parts("plain"),
            [TextPart {
                text: "plain".into(),
                is_match: false
            }]
        );
    }

    #[test]
    fn results_are_grouped_by_category_with_context() {
        let fixture = fixture();
        let web = project(&fixture, "Website relaunch", "new landing page");
        let sprint = board(&fixture, &web, "Launch board");
        let t = task(&fixture, &web, "Launch checklist", "");
        let n = note(&fixture, "Launch plan", "# Launch plan\nsteps\n");
        fs::create_dir_all(fixture.vault.path().join("Launch ideas")).expect("creates dir");
        reindex(&fixture.state).expect("indexes");

        let results = find(&fixture, "launch");

        assert_eq!(ids(&results.projects), Vec::<&str>::new());
        assert_eq!(ids(&results.boards), [sprint.as_str()]);
        assert_eq!(ids(&results.tasks), [t.as_str()]);
        assert_eq!(ids(&results.notes), [n.as_str()]);
        assert_eq!(results.folders.len(), 1);
        assert_eq!(
            results.boards[0].context.as_deref(),
            Some("Website relaunch")
        );
        assert_eq!(results.boards[0].project_id.as_deref(), Some(web.as_str()));
        assert_eq!(
            results.tasks[0].context.as_deref(),
            Some("Website relaunch")
        );
        assert_eq!(results.notes[0].path.as_deref(), Some("Launch plan.md"));
        assert_eq!(results.folders[0].path.as_deref(), Some("Launch ideas"));
        assert_eq!(results.total(), 4);
    }

    #[test]
    fn a_project_is_found_by_name_or_description_and_the_match_is_highlighted() {
        let fixture = fixture();
        let id = project(&fixture, "Apollo", "moon landing simulator");

        let by_description = find(&fixture, "simulator");
        let by_name = find(&fixture, "apol");

        assert_eq!(ids(&by_description.projects), [id.as_str()]);
        assert_eq!(matched(&by_description.projects[0].snippet), ["simulator"]);
        assert_eq!(text(&by_description.projects[0].title), "Apollo");
        assert_eq!(matched(&by_name.projects[0].title), ["Apollo"]);
    }

    #[test]
    fn all_words_must_match_and_each_is_a_prefix() {
        let fixture = fixture();
        let p = project(&fixture, "P", "");
        let both = task(&fixture, &p, "Spring Boot migration", "");
        task(&fixture, &p, "Spring cleaning", "");
        task(&fixture, &p, "Boot camp", "");

        let results = find(&fixture, "spr boo");

        assert_eq!(ids(&results.tasks), [both.as_str()]);
    }

    #[test]
    fn search_ignores_case_and_accents_in_both_directions() {
        let fixture = fixture();
        let p = project(&fixture, "P", "");
        let accented = task(&fixture, &p, "Reunião de Ação", "");
        let plain = task(&fixture, &p, "Final report", "");

        assert_eq!(
            ids(&find(&fixture, "REUNIAO acao").tasks),
            [accented.as_str()]
        );
        assert_eq!(ids(&find(&fixture, "reunião").tasks), [accented.as_str()]);
        assert_eq!(ids(&find(&fixture, "FINAL").tasks), [plain.as_str()]);
    }

    #[test]
    fn user_input_that_looks_like_fts_syntax_never_errors() {
        let fixture = fixture();
        let p = project(&fixture, "P", "");
        task(&fixture, &p, "Plain task", "");

        for hostile in [
            "\"",
            "\"unclosed",
            "title:plain",
            "plain AND",
            "NOT",
            "(",
            "plain*",
            "^plain",
            "NEAR(plain task)",
            "plain OR task",
            "'; DROP TABLE tasks; --",
            "col:\"x\" -y",
        ] {
            let result = search(
                &fixture.state,
                SearchInput {
                    query: hostile.into(),
                    limit_per_category: None,
                },
            );
            assert!(result.is_ok(), "{hostile:?} should not fail");
        }
        assert_eq!(find(&fixture, "title:plain").tasks.len(), 0);
        let both = task(&fixture, &p, "Title of the plain task", "");
        assert_eq!(ids(&find(&fixture, "title:plain").tasks), [both.as_str()]);
    }

    #[test]
    fn an_empty_or_symbol_only_query_finds_nothing() {
        let fixture = fixture();
        let p = project(&fixture, "P", "");
        task(&fixture, &p, "Something", "");

        for query in ["", "   ", "***", "-"] {
            assert_eq!(find(&fixture, query), SearchResults::default());
        }
    }

    #[test]
    fn the_limit_applies_per_category_defaults_to_eight_and_is_capped() {
        let fixture = fixture();
        let p = project(&fixture, "P", "");
        for index in 0..12 {
            task(&fixture, &p, &format!("Report {index}"), "");
            project(&fixture, &format!("Report project {index}"), "");
        }
        let with_limit = |limit: Option<u32>| {
            search(
                &fixture.state,
                SearchInput {
                    query: "report".into(),
                    limit_per_category: limit,
                },
            )
            .expect("searches")
        };

        let default = with_limit(None);
        let three = with_limit(Some(3));
        let zero = with_limit(Some(0));
        let huge = with_limit(Some(10_000));

        assert_eq!((default.tasks.len(), default.projects.len()), (8, 8));
        assert_eq!((three.tasks.len(), three.projects.len()), (3, 3));
        assert_eq!(zero.tasks.len(), 1);
        assert_eq!(huge.tasks.len(), 12);
    }

    #[test]
    fn a_title_match_ranks_above_a_description_only_match() {
        let fixture = fixture();
        let p = project(&fixture, "P", "");
        let in_description = task(&fixture, &p, "Weekly sync", "talk about the kafka cluster");
        let in_title = task(&fixture, &p, "Kafka cluster upgrade", "");

        let results = find(&fixture, "kafka");

        assert_eq!(
            ids(&results.tasks),
            [in_title.as_str(), in_description.as_str()]
        );
    }

    #[test]
    fn edits_renames_and_deletions_are_reflected_immediately() {
        let fixture = fixture();
        let p = project(&fixture, "Old project", "");
        let t = task(&fixture, &p, "Old task", "old words");

        tasks::update(
            &fixture.state,
            &t,
            UpdateTaskInput {
                title: Some("Fresh task".into()),
                description: Some("fresh words".into()),
                ..Default::default()
            },
        )
        .expect("updates task");
        projects::update(
            &fixture.state,
            &p,
            UpdateProjectInput {
                name: Some("Fresh project".into()),
                ..Default::default()
            },
        )
        .expect("updates project");

        assert!(find(&fixture, "old").tasks.is_empty());
        assert!(find(&fixture, "old").projects.is_empty());
        assert_eq!(ids(&find(&fixture, "fresh").tasks), [t.as_str()]);
        assert_eq!(ids(&find(&fixture, "fresh").projects), [p.as_str()]);

        tasks::delete(&fixture.state, &t).expect("deletes task");
        projects::delete(&fixture.state, &p).expect("deletes project");

        assert_eq!(find(&fixture, "fresh"), SearchResults::default());
    }

    #[test]
    fn archived_projects_boards_and_tasks_are_hidden_and_come_back_when_restored() {
        let fixture = fixture();
        let p = project(&fixture, "Gadget project", "");
        let b = board(&fixture, &p, "Gadget board");
        let t = task(&fixture, &p, "Gadget task", "");
        let child = subtasks::create(
            &fixture.state,
            CreateSubtaskInput {
                parent_task_id: t.clone(),
                title: "Gadget subtask".into(),
            },
        )
        .expect("creates subtask")
        .id;
        assert_eq!(find(&fixture, "gadget").total(), 4);

        tasks::archive(&fixture.state, &t).expect("archives task");
        assert_eq!(
            ids(&find(&fixture, "gadget").tasks),
            Vec::<&str>::new(),
            "task and its subtask"
        );
        tasks::restore(&fixture.state, &t).expect("restores task");
        assert_eq!(find(&fixture, "gadget").tasks.len(), 2);

        projects::archive(&fixture.state, &p).expect("archives project");
        assert_eq!(find(&fixture, "gadget"), SearchResults::default());
        projects::restore(&fixture.state, &p).expect("restores project");
        let back = find(&fixture, "gadget");
        assert_eq!(ids(&back.boards), [b.as_str()]);
        assert!(ids(&back.tasks).contains(&child.as_str()));
    }

    #[test]
    fn tasks_on_an_archived_board_are_hidden() {
        let fixture = fixture();
        let p = project(&fixture, "P", "");
        let b = board(&fixture, &p, "Board");
        let details = boards::get(&fixture.state, &b).expect("reads board");
        let placed = tasks::create(
            &fixture.state,
            CreateTaskInput {
                project_id: p.clone(),
                title: "Widget on board".into(),
                description: None,
                priority: None,
                due_date: None,
                column_id: Some(details.columns[0].id.clone()),
            },
        )
        .expect("creates task")
        .id;
        let loose = task(&fixture, &p, "Widget in backlog", "");
        fixture
            .state
            .database()
            .execute(
                "UPDATE boards SET archived_at = '2026-01-01T00:00:00.000Z' WHERE id = ?1",
                [&b],
            )
            .expect("archives board");

        let results = find(&fixture, "widget");

        assert_eq!(ids(&results.tasks), [loose.as_str()]);
        assert!(!ids(&results.tasks).contains(&placed.as_str()));
    }

    #[test]
    fn task_hits_carry_their_navigation_context() {
        let fixture = fixture();
        let p = project(&fixture, "Navigator", "");
        let parent = task(&fixture, &p, "Parent thing", "");
        let child = subtasks::create(
            &fixture.state,
            CreateSubtaskInput {
                parent_task_id: parent.clone(),
                title: "Child thing".into(),
            },
        )
        .expect("creates subtask")
        .id;

        let results = find(&fixture, "thing");

        let child_hit = results
            .tasks
            .iter()
            .find(|hit| hit.entity_id == child)
            .expect("child");
        assert_eq!(child_hit.parent_task_id.as_deref(), Some(parent.as_str()));
        assert_eq!(child_hit.project_id.as_deref(), Some(p.as_str()));
        assert_eq!(child_hit.context.as_deref(), Some("Navigator"));
        let parent_hit = results
            .tasks
            .iter()
            .find(|hit| hit.entity_id == parent)
            .expect("parent");
        assert_eq!(parent_hit.parent_task_id, None);
    }

    #[test]
    fn notes_are_searchable_by_title_and_body_and_follow_saves_renames_and_deletes() {
        let fixture = fixture();
        let id = note(
            &fixture,
            "Hibernate",
            "# Hibernate\nlazy loading pitfalls\n",
        );

        assert_eq!(ids(&find(&fixture, "hibernate").notes), [id.as_str()]);
        let by_body = find(&fixture, "lazy pitfalls");
        assert_eq!(matched(&by_body.notes[0].snippet), ["lazy", "pitfalls"]);

        let opened = notes::get(&fixture.state, &id).expect("reads");
        notes::save(
            &fixture.state,
            &id,
            SaveNoteInput {
                content: "# Hibernate\nsecond level cache\n".into(),
                base_hash: opened.hash,
                tags: None,
                force: false,
            },
        )
        .expect("saves");
        assert!(find(&fixture, "lazy").notes.is_empty());
        assert_eq!(ids(&find(&fixture, "cache").notes), [id.as_str()]);

        notes::rename(&fixture.state, &id, "JPA").expect("renames");
        assert!(find(&fixture, "hibernate").notes.is_empty());
        assert_eq!(ids(&find(&fixture, "jpa").notes), [id.as_str()]);

        notes::delete(&fixture.state, &id).expect("deletes");
        assert_eq!(find(&fixture, "jpa").notes.len(), 0);
        assert_eq!(find(&fixture, "cache").notes.len(), 0);
    }

    #[test]
    fn the_frontmatter_is_not_searchable_but_the_body_is() {
        let fixture = fixture();
        fs::write(
            fixture.vault.path().join("fm.md"),
            "---\nid: fm1\nsecretkey: zebra\n---\n# Visible\nbody text\n",
        )
        .expect("writes");
        reindex(&fixture.state).expect("indexes");

        assert!(find(&fixture, "zebra").notes.is_empty());
        assert!(find(&fixture, "secretkey").notes.is_empty());
        assert_eq!(find(&fixture, "visible").notes.len(), 1);
    }

    #[test]
    fn notes_edited_outside_the_app_are_found_after_the_vault_is_reindexed() {
        let fixture = fixture();
        fs::write(
            fixture.vault.path().join("ext.md"),
            "---\nid: e1\n---\n# External\nalpha\n",
        )
        .expect("writes");
        reindex(&fixture.state).expect("indexes");
        fs::write(
            fixture.vault.path().join("ext.md"),
            "---\nid: e1\n---\n# External\nomega\n",
        )
        .expect("edits");
        reindex(&fixture.state).expect("reindexes");

        assert!(find(&fixture, "alpha").notes.is_empty());
        assert_eq!(find(&fixture, "omega").notes.len(), 1);
    }

    #[test]
    fn unchanged_notes_missing_from_the_index_are_added_by_the_next_reindex() {
        let fixture = fixture();
        let id = note(&fixture, "Orphan", "# Orphan\nuniqueword\n");
        fixture
            .state
            .database()
            .execute_batch(
                "DELETE FROM search_index WHERE rowid IN (SELECT id FROM search_entries WHERE entity_type = 'note');
                 DELETE FROM search_entries WHERE entity_type = 'note';",
            )
            .expect("simulates a database from before the search existed");
        assert!(find(&fixture, "uniqueword").notes.is_empty());

        let report = reindex(&fixture.state).expect("reindexes");

        assert_eq!(ids(&find(&fixture, "uniqueword").notes), [id.as_str()]);
        assert_eq!(report.skipped.len(), 0);
    }

    #[test]
    fn folders_follow_creation_rename_move_and_deletion() {
        let fixture = fixture();
        let create = |parent: Option<&str>, name: &str| {
            folders::create(
                &fixture.state,
                CreateFolderInput {
                    parent_path: parent.map(str::to_string),
                    name: name.into(),
                },
            )
            .expect("creates folder")
        };
        create(None, "Research");
        create(Some("Research"), "Papers");
        assert_eq!(find(&fixture, "papers").folders.len(), 1);

        folders::rename(&fixture.state, "Research/Papers", "Articles").expect("renames");
        assert!(find(&fixture, "papers").folders.is_empty());
        assert_eq!(
            find(&fixture, "articles").folders[0].path.as_deref(),
            Some("Research/Articles")
        );

        create(None, "Archive");
        folders::move_folder(&fixture.state, "Research/Articles", Some("Archive")).expect("moves");
        assert_eq!(
            find(&fixture, "articles").folders[0].path.as_deref(),
            Some("Archive/Articles")
        );

        folders::delete(&fixture.state, "Archive", true).expect("deletes");
        assert!(find(&fixture, "articles").folders.is_empty());
        assert!(find(&fixture, "archive").folders.is_empty());
        assert_eq!(find(&fixture, "research").folders.len(), 1);
    }

    #[test]
    fn a_vault_switch_replaces_the_notes_and_folders_in_the_index() {
        let fixture = fixture();
        note(&fixture, "From first vault", "# First\n");
        let second = tempfile::tempdir().expect("second vault");
        fs::write(second.path().join("other.md"), "# Other vault note\n").expect("writes");
        fs::create_dir(second.path().join("Elsewhere")).expect("creates dir");

        setup(
            &fixture.state,
            SetupVaultInput {
                path: second.path().to_string_lossy().into_owned(),
                create: false,
            },
        )
        .expect("switches vault");

        assert!(find(&fixture, "first").notes.is_empty());
        assert_eq!(find(&fixture, "other").notes.len(), 1);
        assert_eq!(find(&fixture, "elsewhere").folders.len(), 1);
    }

    #[test]
    fn a_note_with_a_huge_body_and_unicode_is_searchable() {
        let fixture = fixture();
        let filler = "lorem ipsum ".repeat(20_000);
        let id = note(
            &fixture,
            "Large",
            &format!("# Large\n{filler}\nタイムスタンプ final needle\n"),
        );

        assert_eq!(ids(&find(&fixture, "needle").notes), [id.as_str()]);
        assert_eq!(ids(&find(&fixture, "タイムスタンプ").notes), [id.as_str()]);
    }
}
