use std::collections::{BTreeMap, HashMap, VecDeque};

use super::models::{
    DEFAULT_DEPTH, Graph, GraphEdge, GraphInput, GraphNode, GraphNodeKind, LocalGraphInput,
    MAX_DEPTH, UNRESOLVED_PREFIX,
};
use super::repository::{self, RawEdge};
use crate::error::{AppError, AppResult};
use crate::modules::notes::models::NoteRecord;
use crate::modules::notes::repository as note_repository;
use crate::state::AppState;

pub fn full(state: &AppState, input: GraphInput) -> AppResult<Graph> {
    let connection = state.database();
    let notes = note_repository::list_all(&connection)?;
    let edges = repository::list_edges(&connection)?;
    let (note_edges, ghost_edges) = split(edges);
    Ok(assemble(
        notes.iter().collect(),
        note_edges,
        input.include_unresolved.then_some(ghost_edges),
        None,
    ))
}

pub fn local(state: &AppState, input: LocalGraphInput) -> AppResult<Graph> {
    let depth = input.depth.unwrap_or(DEFAULT_DEPTH).clamp(1, MAX_DEPTH);
    let connection = state.database();
    let notes = note_repository::list_all(&connection)?;
    let is_known = notes.iter().any(|note| note.id == input.note_id);
    if !is_known {
        return Err(AppError::NotFound("note".into()));
    }
    let (note_edges, ghost_edges) = split(repository::list_edges(&connection)?);

    let distances = distances_from(&input.note_id, &note_edges, depth);
    let included: Vec<&NoteRecord> = notes
        .iter()
        .filter(|note| distances.contains_key(&note.id))
        .collect();
    let edges_inside: Vec<NoteEdge> = note_edges
        .into_iter()
        .filter(|edge| distances.contains_key(&edge.source) && distances.contains_key(&edge.target))
        .collect();
    let ghosts = input.include_unresolved.then(|| {
        ghost_edges
            .into_iter()
            .filter(|edge| {
                distances
                    .get(&edge.source)
                    .is_some_and(|distance| *distance < depth)
            })
            .collect()
    });
    Ok(assemble(included, edges_inside, ghosts, Some(&distances)))
}

#[derive(Debug, Clone)]
struct NoteEdge {
    source: String,
    target: String,
    weight: u32,
}

#[derive(Debug, Clone)]
struct GhostEdge {
    source: String,
    key: String,
    title: String,
    weight: u32,
}

fn split(raw: Vec<RawEdge>) -> (Vec<NoteEdge>, Vec<GhostEdge>) {
    let mut note_edges = Vec::new();
    let mut ghost_edges = Vec::new();
    for edge in raw {
        match edge.target_id {
            Some(target) if target != edge.source_id => note_edges.push(NoteEdge {
                source: edge.source_id,
                target,
                weight: edge.link_count,
            }),
            Some(_) => {}
            None => ghost_edges.push(GhostEdge {
                source: edge.source_id,
                key: edge.target_key,
                title: edge.target_title,
                weight: edge.link_count,
            }),
        }
    }
    (note_edges, ghost_edges)
}

fn distances_from(center: &str, edges: &[NoteEdge], depth: u32) -> HashMap<String, u32> {
    let mut neighbors: HashMap<&str, Vec<&str>> = HashMap::new();
    for edge in edges {
        neighbors
            .entry(edge.source.as_str())
            .or_default()
            .push(edge.target.as_str());
        neighbors
            .entry(edge.target.as_str())
            .or_default()
            .push(edge.source.as_str());
    }

    let mut distances: HashMap<String, u32> = HashMap::new();
    distances.insert(center.to_string(), 0);
    let mut queue: VecDeque<(&str, u32)> = VecDeque::from([(center, 0)]);
    while let Some((current, distance)) = queue.pop_front() {
        if distance >= depth {
            continue;
        }
        for next in neighbors.get(current).into_iter().flatten() {
            if !distances.contains_key(*next) {
                distances.insert((*next).to_string(), distance + 1);
                queue.push_back((next, distance + 1));
            }
        }
    }
    distances
}

fn assemble(
    notes: Vec<&NoteRecord>,
    note_edges: Vec<NoteEdge>,
    ghost_edges: Option<Vec<GhostEdge>>,
    distances: Option<&HashMap<String, u32>>,
) -> Graph {
    let mut degrees: HashMap<String, u32> = HashMap::new();
    let mut edges: Vec<GraphEdge> = Vec::new();
    for edge in note_edges {
        *degrees.entry(edge.source.clone()).or_default() += 1;
        *degrees.entry(edge.target.clone()).or_default() += 1;
        edges.push(GraphEdge {
            source: edge.source,
            target: edge.target,
            weight: edge.weight,
        });
    }

    let mut ghosts: BTreeMap<String, (String, Option<u32>)> = BTreeMap::new();
    for edge in ghost_edges.unwrap_or_default() {
        let ghost_id = format!("{UNRESOLVED_PREFIX}{}", edge.key);
        let source_distance = distances.and_then(|all| all.get(&edge.source)).copied();
        let distance = source_distance.map(|distance| distance + 1);
        let entry = ghosts
            .entry(ghost_id.clone())
            .or_insert_with(|| (edge.title.clone(), distance));
        entry.1 = match (entry.1, distance) {
            (Some(known), Some(new)) => Some(known.min(new)),
            (known, new) => known.or(new),
        };
        *degrees.entry(edge.source.clone()).or_default() += 1;
        *degrees.entry(ghost_id.clone()).or_default() += 1;
        edges.push(GraphEdge {
            source: edge.source,
            target: ghost_id,
            weight: edge.weight,
        });
    }
    edges.sort_by(|left, right| (&left.source, &left.target).cmp(&(&right.source, &right.target)));

    let mut nodes: Vec<GraphNode> = notes
        .into_iter()
        .map(|note| GraphNode {
            id: note.id.clone(),
            kind: GraphNodeKind::Note,
            title: note.title.clone(),
            path: Some(note.path.clone()),
            degree: degrees.get(&note.id).copied().unwrap_or(0),
            distance: distances.and_then(|all| all.get(&note.id)).copied(),
        })
        .collect();
    nodes.extend(ghosts.into_iter().map(|(id, (title, distance))| GraphNode {
        degree: degrees.get(&id).copied().unwrap_or(0),
        id,
        kind: GraphNodeKind::Unresolved,
        title,
        path: None,
        distance,
    }));
    Graph { nodes, edges }
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

    fn note(fixture: &Fixture, title: &str, links: &[&str]) -> String {
        let body: String = links
            .iter()
            .map(|target| format!("[[{target}]] "))
            .collect();
        notes::create(
            &fixture.state,
            CreateNoteInput {
                folder_path: None,
                title: title.into(),
                content: Some(format!("# {title}\n{body}\n")),
                tags: None,
            },
        )
        .expect("creates note")
        .id
    }

    fn full_graph(fixture: &Fixture, include_unresolved: bool) -> Graph {
        full(&fixture.state, GraphInput { include_unresolved }).expect("builds graph")
    }

    fn local_graph(
        fixture: &Fixture,
        id: &str,
        depth: Option<u32>,
        include_unresolved: bool,
    ) -> Graph {
        local(
            &fixture.state,
            LocalGraphInput {
                note_id: id.into(),
                depth,
                include_unresolved,
            },
        )
        .expect("builds local graph")
    }

    fn titles(graph: &Graph) -> Vec<&str> {
        graph.nodes.iter().map(|node| node.title.as_str()).collect()
    }

    fn edge_titles(fixture: &Fixture, graph: &Graph) -> Vec<(String, String, u32)> {
        let name = |id: &str| -> String {
            graph
                .nodes
                .iter()
                .find(|node| node.id == id)
                .map_or(id.to_string(), |node| node.title.clone())
        };
        let _ = fixture;
        let mut named: Vec<(String, String, u32)> = graph
            .edges
            .iter()
            .map(|edge| (name(&edge.source), name(&edge.target), edge.weight))
            .collect();
        named.sort();
        named
    }

    fn degree_of(graph: &Graph, title: &str) -> u32 {
        graph
            .nodes
            .iter()
            .find(|node| node.title == title)
            .expect("node")
            .degree
    }

    fn distance_of(graph: &Graph, title: &str) -> Option<u32> {
        graph
            .nodes
            .iter()
            .find(|node| node.title == title)
            .expect("node")
            .distance
    }

    #[test]
    fn an_empty_vault_has_an_empty_graph() {
        let fixture = fixture();

        assert_eq!(full_graph(&fixture, false), Graph::default());
        assert_eq!(full_graph(&fixture, true), Graph::default());
    }

    #[test]
    fn every_note_is_a_node_including_isolated_ones_and_links_are_directed_weighted_edges() {
        let fixture = fixture();
        note(&fixture, "A", &["B", "b", "C"]);
        note(&fixture, "B", &["A"]);
        note(&fixture, "C", &[]);
        note(&fixture, "Lonely", &[]);

        let graph = full_graph(&fixture, false);

        assert_eq!(titles(&graph), ["A", "B", "C", "Lonely"]);
        assert_eq!(
            edge_titles(&fixture, &graph),
            [
                ("A".to_string(), "B".to_string(), 2),
                ("A".to_string(), "C".to_string(), 1),
                ("B".to_string(), "A".to_string(), 1),
            ]
        );
        assert_eq!(degree_of(&graph, "A"), 3);
        assert_eq!(degree_of(&graph, "B"), 2);
        assert_eq!(degree_of(&graph, "C"), 1);
        assert_eq!(degree_of(&graph, "Lonely"), 0);
        assert!(graph.nodes.iter().all(|node| node.distance.is_none()));
        assert!(
            graph
                .nodes
                .iter()
                .all(|node| node.kind == GraphNodeKind::Note)
        );
    }

    #[test]
    fn a_link_to_itself_makes_no_edge() {
        let fixture = fixture();
        note(&fixture, "Narcissus", &["Narcissus"]);

        let graph = full_graph(&fixture, true);

        assert!(graph.edges.is_empty());
        assert_eq!(degree_of(&graph, "Narcissus"), 0);
        assert_eq!(graph.nodes.len(), 1);
    }

    #[test]
    fn unresolved_links_only_appear_as_nodes_when_asked_and_are_shared_between_notes() {
        let fixture = fixture();
        note(&fixture, "A", &["Missing"]);
        note(&fixture, "B", &["missing", "A"]);

        let without = full_graph(&fixture, false);
        let with = full_graph(&fixture, true);

        assert_eq!(without.nodes.len(), 2);
        assert_eq!(without.edges.len(), 1);
        assert_eq!(with.nodes.len(), 3);
        let ghost = with.nodes.last().expect("ghost node");
        assert_eq!(ghost.kind, GraphNodeKind::Unresolved);
        assert_eq!(ghost.id, "unresolved:missing");
        assert_eq!(ghost.title, "Missing");
        assert_eq!(ghost.path, None);
        assert_eq!(ghost.degree, 2);
        assert_eq!(
            with.edges
                .iter()
                .filter(|edge| edge.target == ghost.id)
                .count(),
            2
        );
    }

    #[test]
    fn duplicate_titles_link_only_to_the_oldest_note() {
        let fixture = fixture();
        let older = note(&fixture, "Twin", &[]);
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
        note(&fixture, "Reader", &["Twin"]);

        let graph = full_graph(&fixture, false);

        let targets: Vec<&str> = graph
            .edges
            .iter()
            .map(|edge| edge.target.as_str())
            .collect();
        assert_eq!(targets, [older.as_str()]);
        assert_eq!(
            graph
                .nodes
                .iter()
                .find(|node| node.id == newer)
                .map(|node| node.degree),
            Some(0)
        );
    }

    #[test]
    fn nodes_and_edges_come_in_a_stable_order() {
        let fixture = fixture();
        note(&fixture, "Zeta", &["Alpha", "Missing"]);
        note(&fixture, "Alpha", &["Zeta"]);

        let first = full_graph(&fixture, true);
        let second = full_graph(&fixture, true);

        assert_eq!(first, second);
        assert_eq!(titles(&first), ["Alpha", "Zeta", "Missing"]);
    }

    #[test]
    fn depth_one_is_the_note_and_its_direct_neighbors_in_both_directions() {
        let fixture = fixture();
        let center = note(&fixture, "Center", &["Out"]);
        note(&fixture, "Out", &["Far"]);
        note(&fixture, "In", &["Center"]);
        note(&fixture, "Far", &[]);
        note(&fixture, "Unrelated", &[]);

        let graph = local_graph(&fixture, &center, None, false);

        assert_eq!(titles(&graph), ["Center", "In", "Out"]);
        assert_eq!(
            edge_titles(&fixture, &graph),
            [
                ("Center".to_string(), "Out".to_string(), 1),
                ("In".to_string(), "Center".to_string(), 1),
            ]
        );
        assert_eq!(distance_of(&graph, "Center"), Some(0));
        assert_eq!(distance_of(&graph, "In"), Some(1));
        assert_eq!(distance_of(&graph, "Out"), Some(1));
        assert_eq!(
            degree_of(&graph, "Out"),
            1,
            "the edge to Far is outside this graph"
        );
    }

    #[test]
    fn deeper_levels_follow_more_links_with_their_distances() {
        let fixture = fixture();
        let center = note(&fixture, "A", &["B"]);
        note(&fixture, "B", &["C"]);
        note(&fixture, "C", &["D"]);
        note(&fixture, "D", &["E"]);
        note(&fixture, "E", &[]);

        let two = local_graph(&fixture, &center, Some(2), false);
        let four = local_graph(&fixture, &center, Some(4), false);

        assert_eq!(titles(&two), ["A", "B", "C"]);
        assert_eq!(distance_of(&two, "C"), Some(2));
        assert_eq!(titles(&four), ["A", "B", "C", "D", "E"]);
        assert_eq!(distance_of(&four, "E"), Some(4));
        assert_eq!(four.edges.len(), 4);
    }

    #[test]
    fn the_depth_is_clamped_between_one_and_five_and_cycles_do_not_repeat_nodes() {
        let fixture = fixture();
        let a = note(&fixture, "A", &["B"]);
        note(&fixture, "B", &["C"]);
        note(&fixture, "C", &["A", "D"]);
        note(&fixture, "D", &["E"]);
        note(&fixture, "E", &["F"]);
        note(&fixture, "F", &["G"]);
        note(&fixture, "G", &["H"]);
        note(&fixture, "H", &[]);

        let zero = local_graph(&fixture, &a, Some(0), false);
        let huge = local_graph(&fixture, &a, Some(1_000), false);

        assert_eq!(titles(&zero), ["A", "B", "C"], "0 is raised to 1");
        assert_eq!(
            titles(&huge),
            ["A", "B", "C", "D", "E", "F", "G"],
            "capped at 5 levels, H is 6 away"
        );
        assert_eq!(distance_of(&huge, "C"), Some(1), "C links back to A");
        assert_eq!(distance_of(&huge, "G"), Some(5));
        let mut ids: Vec<&str> = huge.nodes.iter().map(|node| node.id.as_str()).collect();
        ids.sort_unstable();
        ids.dedup();
        assert_eq!(ids.len(), huge.nodes.len());
    }

    #[test]
    fn edges_between_two_neighbors_are_kept_but_edges_leaving_the_graph_are_not() {
        let fixture = fixture();
        let center = note(&fixture, "Center", &["X", "Y"]);
        note(&fixture, "X", &["Y", "Outside"]);
        note(&fixture, "Y", &[]);
        note(&fixture, "Outside", &[]);

        let graph = local_graph(&fixture, &center, Some(1), false);

        assert_eq!(
            edge_titles(&fixture, &graph),
            [
                ("Center".to_string(), "X".to_string(), 1),
                ("Center".to_string(), "Y".to_string(), 1),
                ("X".to_string(), "Y".to_string(), 1),
            ]
        );
    }

    #[test]
    fn an_isolated_note_is_its_own_local_graph_and_an_unknown_note_is_not_found() {
        let fixture = fixture();
        let lonely = note(&fixture, "Lonely", &[]);

        let graph = local_graph(&fixture, &lonely, Some(3), true);
        let missing = local(
            &fixture.state,
            LocalGraphInput {
                note_id: "ghost".into(),
                depth: None,
                include_unresolved: false,
            },
        );

        assert_eq!(titles(&graph), ["Lonely"]);
        assert!(graph.edges.is_empty());
        assert!(matches!(missing, Err(AppError::NotFound(_))));
    }

    #[test]
    fn unresolved_titles_join_the_local_graph_only_within_the_depth() {
        let fixture = fixture();
        let center = note(&fixture, "Center", &["Near", "Direct ghost"]);
        note(&fixture, "Near", &["Second ghost"]);

        let shallow = local_graph(&fixture, &center, Some(1), true);
        let deeper = local_graph(&fixture, &center, Some(2), true);
        let hidden = local_graph(&fixture, &center, Some(2), false);

        assert_eq!(titles(&shallow), ["Center", "Near", "Direct ghost"]);
        assert_eq!(distance_of(&shallow, "Direct ghost"), Some(1));
        assert_eq!(
            titles(&deeper),
            ["Center", "Near", "Direct ghost", "Second ghost"]
        );
        assert_eq!(distance_of(&deeper, "Second ghost"), Some(2));
        assert_eq!(titles(&hidden), ["Center", "Near"]);
    }

    #[test]
    fn the_graph_follows_saves_renames_and_deletes() {
        let fixture = fixture();
        let a = note(&fixture, "A", &["B"]);
        let b = note(&fixture, "B", &[]);
        assert_eq!(full_graph(&fixture, false).edges.len(), 1);

        let opened = notes::get(&fixture.state, &a).expect("reads");
        notes::save(
            &fixture.state,
            &a,
            SaveNoteInput {
                content: "# A\nno links now\n".into(),
                base_hash: opened.hash,
                tags: None,
                force: false,
            },
        )
        .expect("saves");
        assert!(full_graph(&fixture, false).edges.is_empty());

        let opened = notes::get(&fixture.state, &a).expect("reads");
        notes::save(
            &fixture.state,
            &a,
            SaveNoteInput {
                content: "# A\n[[B]]\n".into(),
                base_hash: opened.hash,
                tags: None,
                force: false,
            },
        )
        .expect("saves");
        notes::rename(&fixture.state, &b, "Renamed").expect("renames");
        let renamed = full_graph(&fixture, false);
        assert_eq!(
            edge_titles(&fixture, &renamed),
            [("A".to_string(), "Renamed".to_string(), 1)]
        );

        notes::delete(&fixture.state, &b).expect("deletes");
        let after = full_graph(&fixture, true);
        assert_eq!(after.nodes.len(), 2);
        assert_eq!(after.nodes[1].kind, GraphNodeKind::Unresolved);
    }

    #[test]
    fn notes_written_outside_the_app_appear_after_a_reindex() {
        let fixture = fixture();
        note(&fixture, "Known", &[]);
        fs::write(
            fixture.vault.path().join("External.md"),
            "---\nid: ext\n---\n# External\n[[Known]]\n",
        )
        .expect("writes");
        reindex(&fixture.state).expect("indexes");

        let graph = full_graph(&fixture, false);

        assert_eq!(graph.nodes.len(), 2);
        assert_eq!(
            edge_titles(&fixture, &graph),
            [("External".to_string(), "Known".to_string(), 1)]
        );
    }
}
