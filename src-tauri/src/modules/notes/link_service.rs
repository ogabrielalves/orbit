use super::models::{Backlink, NoteLinks, NoteSummary, OutgoingLink, UnresolvedLink};
use super::repository;
use crate::error::{AppError, AppResult};
use crate::state::AppState;
use crate::vault::links::title_key;

/// The note a `[[link]]` with this text points to, if any. Accepts `Title`, `Title#Heading` and
/// is case and spacing insensitive. With several notes sharing a title, the oldest wins.
pub fn resolve(state: &AppState, target: &str) -> AppResult<Option<NoteSummary>> {
    let title = target.split('#').next().unwrap_or(target);
    let key = title_key(title);
    let has_no_title = key.is_empty();
    if has_no_title {
        return Ok(None);
    }
    let connection = state.database();
    Ok(repository::resolve_title(&connection, &key)?.map(NoteSummary::from))
}

/// What a note links to (resolved or not) and which notes link to it.
pub fn for_note(state: &AppState, id: &str) -> AppResult<NoteLinks> {
    let connection = state.database();
    let note_exists = repository::find_by_id(&connection, id)?.is_some();
    if !note_exists {
        return Err(AppError::NotFound("note".into()));
    }

    let outgoing = repository::list_outgoing(&connection, id)?
        .into_iter()
        .map(|(link, target)| OutgoingLink {
            target_title: link.target_title,
            link_count: link.link_count,
            resolved: target.map(NoteSummary::from),
        })
        .collect();
    let backlinks = repository::list_backlinks(&connection, id)?
        .into_iter()
        .map(|(note, link_count)| Backlink {
            note: note.into(),
            link_count,
        })
        .collect();
    Ok(NoteLinks {
        outgoing,
        backlinks,
    })
}

/// Titles that notes link to but no note has, each with the notes that link to it.
pub fn unresolved(state: &AppState) -> AppResult<Vec<UnresolvedLink>> {
    let connection = state.database();
    let mut groups: Vec<(String, UnresolvedLink)> = Vec::new();
    for (written_title, source) in repository::list_unresolved(&connection)? {
        let key = title_key(&written_title);
        match groups.iter_mut().find(|(known, _)| *known == key) {
            Some((_, group)) => group.sources.push(source.into()),
            None => groups.push((
                key,
                UnresolvedLink {
                    target_title: written_title,
                    sources: vec![source.into()],
                },
            )),
        }
    }
    Ok(groups.into_iter().map(|(_, group)| group).collect())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::{connection::open_in_memory, migrations};
    use crate::modules::notes::models::{CreateNoteInput, SaveNoteInput};
    use crate::modules::notes::note_service as notes;
    use crate::modules::notes::vault_service::{SetupVaultInput, reindex, setup};
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

    fn note(fixture: &Fixture, title: &str, body: &str) -> String {
        let created = notes::create(
            &fixture.state,
            CreateNoteInput {
                folder_path: None,
                title: title.into(),
                content: Some(body.into()),
                tags: None,
            },
        )
        .expect("creates note");
        created.id
    }

    fn titles(summaries: &[NoteSummary]) -> Vec<&str> {
        summaries.iter().map(|note| note.title.as_str()).collect()
    }

    #[test]
    fn a_link_resolves_by_title_ignoring_case_spacing_and_the_heading_suffix() {
        let fixture = fixture();
        note(&fixture, "Spring Boot", "# Spring Boot\n");

        for written in [
            "Spring Boot",
            "spring   boot",
            "  SPRING BOOT ",
            "Spring Boot#Setup",
        ] {
            let found = resolve(&fixture.state, written).expect("resolves");
            assert_eq!(
                found.map(|note| note.title),
                Some("Spring Boot".to_string()),
                "{written}"
            );
        }
        assert_eq!(resolve(&fixture.state, "Nothing").expect("resolves"), None);
        assert_eq!(resolve(&fixture.state, "   ").expect("resolves"), None);
        assert_eq!(
            resolve(&fixture.state, "#only heading").expect("resolves"),
            None
        );
    }

    #[test]
    fn outgoing_links_show_what_resolves_and_what_does_not() {
        let fixture = fixture();
        note(&fixture, "Hibernate", "# Hibernate\n");
        let source = note(
            &fixture,
            "Source",
            "# Source\n[[Hibernate]] [[hibernate]] [[Missing]]\n",
        );

        let links = for_note(&fixture.state, &source).expect("links");

        assert_eq!(links.outgoing.len(), 2);
        let hibernate = &links.outgoing[0];
        assert_eq!(hibernate.link_count, 2);
        assert_eq!(
            hibernate.resolved.as_ref().map(|note| note.title.as_str()),
            Some("Hibernate")
        );
        let missing = &links.outgoing[1];
        assert_eq!(missing.target_title, "Missing");
        assert_eq!(missing.resolved, None);
    }

    #[test]
    fn backlinks_list_the_notes_that_link_here_with_counts_and_skip_the_note_itself() {
        let fixture = fixture();
        let target = note(&fixture, "Target", "# Target\n[[Target]]\n");
        note(&fixture, "Alpha", "# Alpha\n[[Target]] and [[target]]\n");
        note(&fixture, "Beta", "# Beta\n[[Target#Section|shown]]\n");
        note(&fixture, "Gamma", "# Gamma\nno links\n");

        let links = for_note(&fixture.state, &target).expect("links");

        let summary: Vec<(&str, u32)> = links
            .backlinks
            .iter()
            .map(|backlink| (backlink.note.title.as_str(), backlink.link_count))
            .collect();
        assert_eq!(summary, [("Alpha", 2), ("Beta", 1)]);
    }

    #[test]
    fn creating_the_missing_note_resolves_the_link_and_deleting_it_unresolves_it_again() {
        let fixture = fixture();
        let source = note(&fixture, "Source", "# Source\n[[Later]]\n");
        let before = for_note(&fixture.state, &source).expect("links");
        let later = note(&fixture, "Later", "# Later\n");
        let during = for_note(&fixture.state, &source).expect("links");
        notes::delete(&fixture.state, &later).expect("deletes");
        let after = for_note(&fixture.state, &source).expect("links");

        assert_eq!(before.outgoing[0].resolved, None);
        assert_eq!(
            during.outgoing[0]
                .resolved
                .as_ref()
                .map(|note| note.id.as_str()),
            Some(later.as_str())
        );
        assert_eq!(after.outgoing[0].resolved, None);
    }

    #[test]
    fn renaming_a_note_keeps_every_link_resolved_through_the_rewrite() {
        let fixture = fixture();
        let target = note(&fixture, "Old", "# Old\n");
        let source = note(&fixture, "Source", "# Source\n[[Old]]\n");

        notes::rename(&fixture.state, &target, "New").expect("renames");

        let links = for_note(&fixture.state, &source).expect("links");
        assert_eq!(links.outgoing[0].target_title, "New");
        assert_eq!(
            links.outgoing[0]
                .resolved
                .as_ref()
                .map(|note| note.id.as_str()),
            Some(target.as_str())
        );
        assert!(unresolved(&fixture.state).expect("lists").is_empty());
    }

    #[test]
    fn duplicate_titles_resolve_to_the_oldest_note_and_only_it_gets_the_backlinks() {
        let fixture = fixture();
        let older = note(&fixture, "Twin", "# Twin\n");
        fs::create_dir_all(fixture.vault.path().join("sub")).expect("creates dir");
        std::thread::sleep(std::time::Duration::from_millis(3));
        let newer = notes::create(
            &fixture.state,
            CreateNoteInput {
                folder_path: Some("sub".into()),
                title: "Twin".into(),
                content: Some("# Twin\n".into()),
                tags: None,
            },
        )
        .expect("creates twin")
        .id;
        let source = note(&fixture, "Source", "# Source\n[[Twin]]\n");

        let resolved = resolve(&fixture.state, "Twin")
            .expect("resolves")
            .expect("found");
        let older_links = for_note(&fixture.state, &older).expect("links");
        let newer_links = for_note(&fixture.state, &newer).expect("links");
        let source_links = for_note(&fixture.state, &source).expect("links");

        assert_eq!(resolved.id, older);
        assert_eq!(older_links.backlinks.len(), 1);
        assert!(newer_links.backlinks.is_empty());
        assert_eq!(
            source_links.outgoing[0]
                .resolved
                .as_ref()
                .map(|note| note.id.as_str()),
            Some(older.as_str())
        );
    }

    #[test]
    fn unresolved_links_are_grouped_by_title_with_their_sources_and_exclude_resolved_ones() {
        let fixture = fixture();
        note(&fixture, "Exists", "# Exists\n");
        note(&fixture, "A", "# A\n[[Ghost]] [[Exists]]\n");
        note(&fixture, "B", "# B\n[[ghost]] [[Apparition]]\n");

        let groups = unresolved(&fixture.state).expect("lists");

        assert_eq!(groups.len(), 2);
        assert_eq!(groups[0].target_title, "Apparition");
        assert_eq!(titles(&groups[0].sources), ["B"]);
        assert_eq!(groups[1].target_title, "Ghost");
        assert_eq!(titles(&groups[1].sources), ["A", "B"]);
    }

    #[test]
    fn links_inside_code_and_embeds_are_not_links() {
        let fixture = fixture();
        let source = note(
            &fixture,
            "Source",
            "# Source\n`[[Inline]]`\n```\n[[Fenced]]\n```\n![[image.png]]\n",
        );

        let links = for_note(&fixture.state, &source).expect("links");

        assert!(links.outgoing.is_empty());
        assert!(unresolved(&fixture.state).expect("lists").is_empty());
    }

    #[test]
    fn saving_a_note_updates_its_links_and_the_other_notes_backlinks() {
        let fixture = fixture();
        let target = note(&fixture, "Target", "# Target\n");
        let source = note(&fixture, "Source", "# Source\nno link yet\n");
        let opened = notes::get(&fixture.state, &source).expect("reads");

        notes::save(
            &fixture.state,
            &source,
            SaveNoteInput {
                content: "# Source\nnow [[Target]]\n".into(),
                base_hash: opened.hash,
                tags: None,
                force: false,
            },
        )
        .expect("saves");

        let links = for_note(&fixture.state, &target).expect("links");
        assert_eq!(links.backlinks.len(), 1);
        assert_eq!(links.backlinks[0].note.id, source);
    }

    #[test]
    fn an_unknown_note_is_not_found() {
        let fixture = fixture();

        assert!(matches!(
            for_note(&fixture.state, "ghost"),
            Err(AppError::NotFound(_))
        ));
    }

    #[test]
    fn links_follow_notes_edited_outside_the_app_after_a_reindex() {
        let fixture = fixture();
        let source = note(&fixture, "Source", "# Source\n");
        fs::write(
            fixture.vault.path().join("External.md"),
            "---\nid: ext\n---\n# External\n[[Source]]\n",
        )
        .expect("writes");
        reindex(&fixture.state).expect("indexes");

        let links = for_note(&fixture.state, &source).expect("links");

        assert_eq!(links.backlinks.len(), 1);
        assert_eq!(links.backlinks[0].note.id, "ext");
    }
}
