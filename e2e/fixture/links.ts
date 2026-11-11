import type {
  Backlink,
  Graph,
  GraphEdge,
  GraphInput,
  GraphNode,
  LocalGraphInput,
  NoteLinks,
  NoteSummary,
  OutgoingLink,
  UnresolvedLink,
} from "@/bindings";
import { fail } from "./failure";
import { requireVault, resolveKey, sortedNotes, summaryOf, titleOfNote } from "./notes";
import type { State } from "./state";
import type { StoredNote } from "./vaultTypes";
import { linkRecords, titleKey } from "./wikilinks";

const UNRESOLVED_PREFIX = "unresolved:";
const DEFAULT_DEPTH = 1;
const MAX_DEPTH = 5;

type NoteEdge = { source: string; target: string; weight: number };
type GhostEdge = { source: string; key: string; title: string; weight: number };

function compareText(a: string, b: string): number {
  if (a === b) {
    return 0;
  }
  return a < b ? -1 : 1;
}

export function createLinks(state: State) {
  function findNote(id: string): StoredNote {
    const note = state.notes.find((candidate) => candidate.id === id);
    if (note === undefined) {
      fail("NOT_FOUND", "note not found");
    }
    return note;
  }

  function splitEdges(): { noteEdges: NoteEdge[]; ghostEdges: GhostEdge[] } {
    const noteEdges: NoteEdge[] = [];
    const ghostEdges: GhostEdge[] = [];
    const sources = [...state.notes].sort((a, b) => compareText(a.id, b.id));
    for (const source of sources) {
      for (const link of linkRecords(source.body)) {
        const target = resolveKey(state, link.targetKey);
        if (target === undefined) {
          ghostEdges.push({
            source: source.id,
            key: link.targetKey,
            title: link.targetTitle,
            weight: link.linkCount,
          });
        } else if (target.id !== source.id) {
          noteEdges.push({ source: source.id, target: target.id, weight: link.linkCount });
        }
      }
    }
    return { noteEdges, ghostEdges };
  }

  function distancesFrom(center: string, edges: NoteEdge[], depth: number): Map<string, number> {
    const neighbors = new Map<string, string[]>();
    for (const edge of edges) {
      neighbors.set(edge.source, [...(neighbors.get(edge.source) ?? []), edge.target]);
      neighbors.set(edge.target, [...(neighbors.get(edge.target) ?? []), edge.source]);
    }
    const distances = new Map<string, number>([[center, 0]]);
    const queue: [string, number][] = [[center, 0]];
    while (queue.length > 0) {
      const [current, distance] = queue.shift() as [string, number];
      if (distance >= depth) {
        continue;
      }
      for (const next of neighbors.get(current) ?? []) {
        if (!distances.has(next)) {
          distances.set(next, distance + 1);
          queue.push([next, distance + 1]);
        }
      }
    }
    return distances;
  }

  function assemble(
    notes: StoredNote[],
    noteEdges: NoteEdge[],
    ghostEdges: GhostEdge[] | null,
    distances: Map<string, number> | null,
  ): Graph {
    const degrees = new Map<string, number>();
    const bump = (id: string) => degrees.set(id, (degrees.get(id) ?? 0) + 1);
    const edges: GraphEdge[] = [];
    for (const edge of noteEdges) {
      bump(edge.source);
      bump(edge.target);
      edges.push({ source: edge.source, target: edge.target, weight: edge.weight });
    }
    const ghosts = new Map<string, { title: string; distance: number | null }>();
    for (const edge of ghostEdges ?? []) {
      const ghostId = `${UNRESOLVED_PREFIX}${edge.key}`;
      const sourceDistance = distances?.get(edge.source);
      const distance = sourceDistance === undefined ? null : sourceDistance + 1;
      const known = ghosts.get(ghostId);
      if (known === undefined) {
        ghosts.set(ghostId, { title: edge.title, distance });
      } else if (distance !== null) {
        known.distance = known.distance === null ? distance : Math.min(known.distance, distance);
      }
      bump(edge.source);
      bump(ghostId);
      edges.push({ source: edge.source, target: ghostId, weight: edge.weight });
    }
    edges.sort((a, b) => compareText(a.source, b.source) || compareText(a.target, b.target));
    const nodes: GraphNode[] = notes.map((note) => ({
      id: note.id,
      kind: "note",
      title: titleOfNote(note),
      path: note.path,
      degree: degrees.get(note.id) ?? 0,
      distance: distances?.get(note.id) ?? null,
    }));
    const orderedGhosts = [...ghosts.entries()].sort((a, b) => compareText(a[0], b[0]));
    for (const [id, ghost] of orderedGhosts) {
      nodes.push({
        id,
        kind: "unresolved",
        title: ghost.title,
        path: null,
        degree: degrees.get(id) ?? 0,
        distance: ghost.distance,
      });
    }
    return { nodes, edges };
  }

  return {
    resolveNoteLink: (target: string): NoteSummary | null => {
      requireVault(state);
      const key = titleKey(target.split("#")[0] ?? target);
      if (key === "") {
        return null;
      }
      const note = resolveKey(state, key);
      return note === undefined ? null : summaryOf(note);
    },
    getNoteLinks: (id: string): NoteLinks => {
      requireVault(state);
      const note = findNote(id);
      const outgoing: OutgoingLink[] = linkRecords(note.body).map((link) => {
        const target = resolveKey(state, link.targetKey);
        return {
          targetTitle: link.targetTitle,
          linkCount: link.linkCount,
          resolved: target === undefined ? null : summaryOf(target),
        };
      });
      const ownKey = titleKey(titleOfNote(note));
      const isOwner = resolveKey(state, ownKey)?.id === note.id;
      const backlinks: Backlink[] = [];
      if (isOwner) {
        for (const source of sortedNotes(state)) {
          const link = linkRecords(source.body).find((candidate) => candidate.targetKey === ownKey);
          if (source.id !== note.id && link !== undefined) {
            backlinks.push({ note: summaryOf(source), linkCount: link.linkCount });
          }
        }
      }
      return { outgoing, backlinks };
    },
    listUnresolvedLinks: (): UnresolvedLink[] => {
      requireVault(state);
      const rows: { key: string; title: string; source: StoredNote }[] = [];
      for (const source of sortedNotes(state)) {
        for (const link of linkRecords(source.body)) {
          if (resolveKey(state, link.targetKey) === undefined) {
            rows.push({ key: link.targetKey, title: link.targetTitle, source });
          }
        }
      }
      rows.sort((a, b) => compareText(a.key, b.key) || compareText(a.source.path, b.source.path));
      const groups = new Map<string, UnresolvedLink>();
      for (const row of rows) {
        const group = groups.get(row.key);
        if (group === undefined) {
          groups.set(row.key, { targetTitle: row.title, sources: [summaryOf(row.source)] });
        } else {
          group.sources.push(summaryOf(row.source));
        }
      }
      return [...groups.values()];
    },
    getGraph: (input: GraphInput): Graph => {
      requireVault(state);
      const { noteEdges, ghostEdges } = splitEdges();
      return assemble(
        sortedNotes(state),
        noteEdges,
        input.includeUnresolved === true ? ghostEdges : null,
        null,
      );
    },
    getLocalGraph: (input: LocalGraphInput): Graph => {
      requireVault(state);
      const depth = Math.min(Math.max(input.depth ?? DEFAULT_DEPTH, 1), MAX_DEPTH);
      findNote(input.noteId);
      const { noteEdges, ghostEdges } = splitEdges();
      const distances = distancesFrom(input.noteId, noteEdges, depth);
      const included = sortedNotes(state).filter((note) => distances.has(note.id));
      const edgesInside = noteEdges.filter(
        (edge) => distances.has(edge.source) && distances.has(edge.target),
      );
      const ghosts =
        input.includeUnresolved === true
          ? ghostEdges.filter((edge) => (distances.get(edge.source) ?? depth) < depth)
          : null;
      return assemble(included, edgesInside, ghosts, distances);
    },
  };
}
