import type {
  CreateNoteInput,
  ListNotesInput,
  NoteDetails,
  NoteSummary,
  RenameNoteResult,
  SaveNoteInput,
} from "@/bindings";
import { type Recorder, track } from "./activity";
import { fail } from "./failure";
import type { Clock } from "./projects";
import type { State } from "./state";
import {
  isSameOrInside,
  join,
  nameOf,
  normalizeRelative,
  parentOf,
  validateName,
} from "./vaultPaths";
import type { StoredNote } from "./vaultTypes";
import { linkRecords, replaceTitle, retarget, titleKey, titleOf } from "./wikilinks";

const NOTE_EXTENSION = ".md";
const UNTITLED = "Untitled";
const MAX_NOTE_BYTES = 10 * 1024 * 1024;
const MAX_TAGS_PER_NOTE = 30;
const TAG_MAX_LENGTH = 40;
const HASH_SEEDS = [0x811c9dc5, 0x01000193];

export function requireVault(state: State): void {
  if (state.settings.vaultPath === null) {
    fail("NOT_FOUND", "vault not found");
  }
}

function fileStem(path: string): string {
  const name = nameOf(path);
  return name.endsWith(NOTE_EXTENSION) ? name.slice(0, -NOTE_EXTENSION.length) : name;
}

export function titleOfNote(note: StoredNote): string {
  const title = titleOf(note.body, fileStem(note.path));
  return title.trim() === "" ? UNTITLED : title;
}

export function summaryOf(note: StoredNote): NoteSummary {
  return {
    id: note.id,
    path: note.path,
    title: titleOfNote(note),
    createdAt: note.createdAt,
    modifiedAt: note.modifiedAt,
  };
}

export function contentHash(text: string): string {
  const [first = 0, second = 0] = HASH_SEEDS.map((seed) => {
    let hash = seed;
    for (let index = 0; index < text.length; index += 1) {
      hash = Math.imul(hash ^ text.charCodeAt(index), 0x01000193) >>> 0;
    }
    return hash;
  });
  return `${first.toString(16).padStart(8, "0")}${second.toString(16).padStart(8, "0")}`;
}

function hashOf(note: StoredNote): string {
  return contentHash(`${note.tags.join("\u0000")}\u0001${note.body}`);
}

export function detailsOf(note: StoredNote): NoteDetails {
  return {
    ...summaryOf(note),
    tags: [...note.tags],
    content: note.body,
    hash: hashOf(note),
  };
}

export function sortedNotes(state: State): StoredNote[] {
  return [...state.notes].sort((a, b) => (a.path < b.path ? -1 : 1));
}

export function resolveKey(state: State, key: string): StoredNote | undefined {
  const matches = state.notes.filter((note) => titleKey(titleOfNote(note)) === key);
  matches.sort((a, b) => {
    if (a.createdAt !== b.createdAt) {
      return a.createdAt < b.createdAt ? -1 : 1;
    }
    return a.path < b.path ? -1 : 1;
  });
  return matches[0];
}

export function nameIsTaken(
  state: State,
  directory: string,
  name: string,
  except: { noteId?: string; folderPath?: string } = {},
): boolean {
  const wanted = name.toLowerCase();
  const inNotes = state.notes.some(
    (note) =>
      note.id !== except.noteId &&
      parentOf(note.path) === directory &&
      nameOf(note.path).toLowerCase() === wanted,
  );
  const inFolders = state.folders.some(
    (folder) =>
      folder !== except.folderPath &&
      parentOf(folder) === directory &&
      nameOf(folder).toLowerCase() === wanted,
  );
  return inNotes || inFolders;
}

export function requireFolder(state: State, path: string): void {
  if (path !== "" && !state.folders.includes(path)) {
    fail("NOT_FOUND", "folder not found");
  }
}

function ensureNameIsFree(
  state: State,
  directory: string,
  name: string,
  except: { noteId?: string } = {},
): void {
  if (nameIsTaken(state, directory, name, except)) {
    fail("CONFLICT", `'${name}' already exists in that folder`);
  }
}

function ensureSize(content: string): void {
  if (new TextEncoder().encode(content).length > MAX_NOTE_BYTES) {
    fail("VALIDATION", "the note is too large (10 MB limit)");
  }
}

function normalizeTags(raw: string[]): string[] {
  const tags: string[] = [];
  for (const item of raw) {
    const tag = item.trim().replace(/^#+/, "").trim();
    if (tag === "") {
      continue;
    }
    if ([...tag].length > TAG_MAX_LENGTH) {
      fail("VALIDATION", `a tag cannot exceed ${TAG_MAX_LENGTH} characters`);
    }
    const isNew = !tags.some((known) => known.toLowerCase() === tag.toLowerCase());
    if (isNew) {
      tags.push(tag);
    }
  }
  if (tags.length > MAX_TAGS_PER_NOTE) {
    fail("VALIDATION", `a note cannot have more than ${MAX_TAGS_PER_NOTE} tags`);
  }
  return tags;
}

export function createNotes(state: State, clock: Clock, record: Recorder) {
  function find(id: string): StoredNote {
    const note = state.notes.find((candidate) => candidate.id === id);
    if (note === undefined) {
      fail("NOT_FOUND", "note not found");
    }
    return note;
  }

  function create(input: CreateNoteInput): NoteDetails {
    requireVault(state);
    const folder = normalizeRelative(input.folderPath ?? "");
    const title = validateName("note title", input.title);
    const tags = normalizeTags(input.tags ?? []);
    const body = input.content ?? `\n# ${title}\n`;
    ensureSize(body);
    requireFolder(state, folder);
    const fileName = `${title}${NOTE_EXTENSION}`;
    ensureNameIsFree(state, folder, fileName);
    const now = clock.now();
    const note: StoredNote = {
      id: clock.nextId("n"),
      path: join(folder, fileName),
      createdAt: now,
      modifiedAt: now,
      tags,
      body,
    };
    state.notes.push(note);
    const changes = {};
    track(changes, "title", null, titleOfNote(note));
    track(changes, "path", null, note.path);
    record("note", note.id, "created", changes);
    return detailsOf(note);
  }

  function rewriteIncomingLinks(renamed: StoredNote, oldTitle: string): number {
    const oldKey = titleKey(oldTitle);
    const renamedKey = titleKey(titleOfNote(renamed));
    const stillResolves =
      oldKey === renamedKey ||
      state.notes.some((note) => note.id !== renamed.id && titleKey(titleOfNote(note)) === oldKey);
    if (stillResolves) {
      return 0;
    }
    let rewritten = 0;
    for (const source of sortedNotes(state)) {
      const pointsAtOldTitle = linkRecords(source.body).some((link) => link.targetKey === oldKey);
      if (!pointsAtOldTitle) {
        continue;
      }
      const [text, changed] = retarget(source.body, oldTitle, titleOfNote(renamed));
      if (changed > 0) {
        source.body = text;
        source.modifiedAt = clock.now();
        rewritten += 1;
      }
    }
    return rewritten;
  }

  return {
    listNotes: (input: ListNotesInput): NoteSummary[] => {
      requireVault(state);
      const all = sortedNotes(state);
      if (input.folderPath === undefined || input.folderPath === null) {
        return all.map(summaryOf);
      }
      const folder = normalizeRelative(input.folderPath);
      requireFolder(state, folder);
      const isWanted = (note: StoredNote): boolean => {
        const isDirectChild = parentOf(note.path) === folder;
        const isBelow = folder === "" || isSameOrInside(note.path, folder);
        return isDirectChild || (input.includeSubfolders === true && isBelow);
      };
      return all.filter(isWanted).map(summaryOf);
    },
    getNote: (id: string): NoteDetails => {
      requireVault(state);
      return detailsOf(find(id));
    },
    createNote: create,
    saveNote: (id: string, input: SaveNoteInput): NoteDetails => {
      requireVault(state);
      ensureSize(input.content);
      const tags =
        input.tags === undefined || input.tags === null ? null : normalizeTags(input.tags);
      const note = find(id);
      const hasChangedOutside = hashOf(note) !== input.baseHash;
      if (hasChangedOutside && input.force !== true) {
        fail("CONFLICT", "the note changed outside ORBIT since it was opened");
      }
      note.body = input.content;
      if (tags !== null) {
        note.tags = tags;
      }
      note.modifiedAt = clock.now();
      return detailsOf(note);
    },
    renameNote: (id: string, newTitle: string): RenameNoteResult => {
      requireVault(state);
      const title = validateName("note title", newTitle);
      const note = find(id);
      const oldTitle = titleOfNote(note);
      const oldPath = note.path;
      const folder = parentOf(note.path);
      const fileName = `${title}${NOTE_EXTENSION}`;
      const newPath = join(folder, fileName);
      if (newPath === oldPath && title === oldTitle) {
        return { note: summaryOf(note), rewrittenNotes: 0 };
      }
      ensureNameIsFree(state, folder, fileName, { noteId: note.id });
      const renamedBody = replaceTitle(note.body, oldTitle, title);
      if (renamedBody !== null) {
        note.body = renamedBody;
      }
      note.path = newPath;
      note.modifiedAt = clock.now();
      const rewrittenNotes = rewriteIncomingLinks(note, oldTitle);
      const changes = {};
      track(changes, "title", oldTitle, titleOfNote(note));
      track(changes, "path", oldPath, note.path);
      record("note", note.id, "updated", changes);
      return { note: summaryOf(note), rewrittenNotes };
    },
    moveNote: (id: string, newFolderPath: string | null): NoteSummary => {
      requireVault(state);
      const folder = normalizeRelative(newFolderPath ?? "");
      const note = find(id);
      requireFolder(state, folder);
      if (parentOf(note.path) === folder) {
        return summaryOf(note);
      }
      const fileName = nameOf(note.path);
      ensureNameIsFree(state, folder, fileName, { noteId: note.id });
      const oldPath = note.path;
      note.path = join(folder, fileName);
      note.modifiedAt = clock.now();
      const changes = {};
      track(changes, "path", oldPath, note.path);
      record("note", note.id, "moved", changes);
      return summaryOf(note);
    },
    deleteNote: (id: string): null => {
      requireVault(state);
      const note = find(id);
      const changes = {};
      track(changes, "title", titleOfNote(note), null);
      track(changes, "path", note.path, null);
      record("note", note.id, "deleted", changes);
      state.notes = state.notes.filter((candidate) => candidate.id !== id);
      state.favorites = state.favorites.filter(
        (favorite) => !(favorite.entityType === "note" && favorite.entityId === id),
      );
      return null;
    },
  };
}
