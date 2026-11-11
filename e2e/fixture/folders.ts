import type { CreateFolderInput, FolderEntry } from "@/bindings";
import { type Recorder, track } from "./activity";
import { fail } from "./failure";
import { nameIsTaken, requireFolder, requireVault } from "./notes";
import type { State } from "./state";
import {
  ATTACHMENTS_DIRECTORY,
  isSameOrInside,
  join,
  nameOf,
  normalizeRelative,
  parentOf,
  validateName,
} from "./vaultPaths";

function folderPath(input: string): string {
  const path = normalizeRelative(input);
  if (path === "") {
    fail("VALIDATION", "choose a folder inside the vault, not the vault itself");
  }
  return path;
}

function ensureNotReserved(parent: string, name: string): void {
  const isReserved = name.toLowerCase() === ATTACHMENTS_DIRECTORY;
  if (parent === "" && isReserved) {
    fail("VALIDATION", `'${ATTACHMENTS_DIRECTORY}' is reserved for pasted images`);
  }
}

function replacePrefix(path: string, from: string, to: string): string {
  return path === from ? to : `${to}${path.slice(from.length)}`;
}

export function createFolders(state: State, record: Recorder) {
  function entryOf(path: string): FolderEntry {
    const noteCount = state.notes.filter((note) => parentOf(note.path) === path).length;
    return { path, name: nameOf(path), noteCount };
  }

  function ensureFree(directory: string, name: string, except: { folderPath?: string } = {}): void {
    if (nameIsTaken(state, directory, name, except)) {
      fail("CONFLICT", `'${name}' already exists in that folder`);
    }
  }

  function relocate(path: string, newPath: string, action: "updated" | "moved"): FolderEntry {
    state.folders = state.folders.map((folder) =>
      isSameOrInside(folder, path) ? replacePrefix(folder, path, newPath) : folder,
    );
    for (const note of state.notes) {
      if (isSameOrInside(note.path, path)) {
        note.path = replacePrefix(note.path, path, newPath);
      }
    }
    for (const favorite of state.favorites) {
      if (favorite.entityType === "folder" && isSameOrInside(favorite.entityId, path)) {
        favorite.entityId = replacePrefix(favorite.entityId, path, newPath);
      }
    }
    const changes = {};
    track(changes, "path", path, newPath);
    record("folder", newPath, action, changes);
    return entryOf(newPath);
  }

  return {
    listFolders: (): FolderEntry[] => {
      requireVault(state);
      return [...state.folders]
        .sort((a, b) => (a.toLowerCase() < b.toLowerCase() ? -1 : 1))
        .map(entryOf);
    },
    createFolder: (input: CreateFolderInput): FolderEntry => {
      requireVault(state);
      const parent = normalizeRelative(input.parentPath ?? "");
      const name = validateName("folder name", input.name);
      requireFolder(state, parent);
      ensureNotReserved(parent, name);
      ensureFree(parent, name);
      const path = join(parent, name);
      state.folders.push(path);
      const changes = {};
      track(changes, "path", null, path);
      record("folder", path, "created", changes);
      return entryOf(path);
    },
    renameFolder: (path: string, newName: string): FolderEntry => {
      requireVault(state);
      const current = folderPath(path);
      const name = validateName("folder name", newName);
      requireFolder(state, current);
      const parent = parentOf(current);
      ensureNotReserved(parent, name);
      if (nameOf(current) === name) {
        return entryOf(current);
      }
      ensureFree(parent, name, { folderPath: current });
      return relocate(current, join(parent, name), "updated");
    },
    moveFolder: (path: string, newParentPath: string | null): FolderEntry => {
      requireVault(state);
      const current = folderPath(path);
      const newParent = normalizeRelative(newParentPath ?? "");
      requireFolder(state, current);
      requireFolder(state, newParent);
      if (isSameOrInside(newParent, current)) {
        fail("INVALID_MOVE", "a folder cannot be moved into itself");
      }
      const name = nameOf(current);
      ensureNotReserved(newParent, name);
      if (parentOf(current) === newParent) {
        return entryOf(current);
      }
      ensureFree(newParent, name, { folderPath: current });
      return relocate(current, join(newParent, name), "moved");
    },
    deleteFolder: (path: string, recursive: boolean): null => {
      requireVault(state);
      const current = folderPath(path);
      requireFolder(state, current);
      const hasNotes = state.notes.some((note) => isSameOrInside(note.path, current));
      const hasFolders = state.folders.some(
        (folder) => folder !== current && isSameOrInside(folder, current),
      );
      if ((hasNotes || hasFolders) && !recursive) {
        fail("CONFLICT", "the folder is not empty; delete it recursively to remove its contents");
      }
      state.notes = state.notes.filter((note) => !isSameOrInside(note.path, current));
      state.folders = state.folders.filter((folder) => !isSameOrInside(folder, current));
      state.favorites = state.favorites.filter(
        (favorite) =>
          !(favorite.entityType === "folder" && isSameOrInside(favorite.entityId, current)),
      );
      const changes = {};
      track(changes, "path", current, null);
      record("folder", current, "deleted", changes);
      return null;
    },
  };
}
