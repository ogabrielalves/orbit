import type { FavoriteEntry, FavoriteRef } from "@/bindings";
import { fail } from "./failure";
import { requireVault, titleOfNote } from "./notes";
import type { Clock } from "./projects";
import type { State } from "./state";
import { nameOf, normalizeRelative, parentOf } from "./vaultPaths";

type Resolved = Omit<FavoriteEntry, "entityType" | "entityId" | "createdAt">;

function keyOf(reference: FavoriteRef): string {
  return `${reference.entityType}:${reference.entityId}`;
}

function canonicalId(reference: FavoriteRef): string {
  if (reference.entityType === "folder") {
    const path = normalizeRelative(reference.entityId);
    if (path === "") {
      fail("VALIDATION", "choose a folder inside the vault, not the vault itself");
    }
    return path;
  }
  const id = reference.entityId.trim();
  if (id === "") {
    fail("VALIDATION", "the favorite needs an id");
  }
  return id;
}

export function createFavorites(state: State, clock: Clock) {
  function resolve(reference: FavoriteRef): Resolved | null {
    const { entityType, entityId } = reference;
    if (entityType === "project") {
      const project = state.projects.find((candidate) => candidate.id === entityId);
      if (project === undefined) {
        return null;
      }
      return {
        title: project.name,
        context: null,
        projectId: null,
        boardId: null,
        parentTaskId: null,
        path: null,
        isArchived: project.archivedAt !== null,
      };
    }
    if (entityType === "board") {
      const board = state.boards.find((candidate) => candidate.id === entityId);
      const project = state.projects.find((candidate) => candidate.id === board?.projectId);
      if (board === undefined || project === undefined) {
        return null;
      }
      return {
        title: board.name,
        context: project.name,
        projectId: project.id,
        boardId: board.id,
        parentTaskId: null,
        path: null,
        isArchived: project.archivedAt !== null,
      };
    }
    if (entityType === "task") {
      const task = state.tasks.find((candidate) => candidate.id === entityId);
      const project = state.projects.find((candidate) => candidate.id === task?.projectId);
      if (task === undefined || project === undefined) {
        return null;
      }
      const parent = state.tasks.find((candidate) => candidate.id === task.parentTaskId);
      return {
        title: task.title,
        context: project.name,
        projectId: project.id,
        boardId: task.boardId,
        parentTaskId: task.parentTaskId,
        path: null,
        isArchived:
          task.archivedAt !== null ||
          project.archivedAt !== null ||
          (parent?.archivedAt ?? null) !== null,
      };
    }
    if (entityType === "note") {
      const note = state.notes.find((candidate) => candidate.id === entityId);
      if (note === undefined) {
        return null;
      }
      const folder = parentOf(note.path);
      return {
        title: titleOfNote(note),
        context: folder === "" ? null : folder,
        projectId: null,
        boardId: null,
        parentTaskId: null,
        path: note.path,
        isArchived: false,
      };
    }
    if (state.settings.vaultPath === null || !state.folders.includes(entityId)) {
      return null;
    }
    const parent = parentOf(entityId);
    return {
      title: nameOf(entityId),
      context: parent === "" ? null : parent,
      projectId: null,
      boardId: null,
      parentTaskId: null,
      path: entityId,
      isArchived: false,
    };
  }

  function keyedStored(): Map<string, FavoriteEntry> {
    return new Map(state.favorites.map((favorite) => [keyOf(favorite), favorite]));
  }

  return {
    listFavorites: (): FavoriteEntry[] => {
      const entries: FavoriteEntry[] = [];
      for (const stored of state.favorites) {
        const resolved = resolve(stored);
        if (resolved !== null) {
          entries.push({ ...stored, ...resolved });
        }
      }
      return entries;
    },
    toggleFavorite: (reference: FavoriteRef): boolean => {
      const entityId = canonicalId(reference);
      const target: FavoriteRef = { entityType: reference.entityType, entityId };
      const key = keyOf(target);
      if (keyedStored().has(key)) {
        state.favorites = state.favorites.filter((favorite) => keyOf(favorite) !== key);
        return false;
      }
      if (target.entityType === "folder") {
        requireVault(state);
      }
      const resolved = resolve(target);
      if (resolved === null) {
        fail("NOT_FOUND", target.entityType);
      }
      state.favorites.push({ ...target, ...resolved, createdAt: clock.now() });
      return true;
    },
    moveFavorite: (reference: FavoriteRef, afterReference: FavoriteRef | null): null => {
      const targetKey = keyOf({
        entityType: reference.entityType,
        entityId: canonicalId(reference),
      });
      const afterKey =
        afterReference === null
          ? null
          : keyOf({
              entityType: afterReference.entityType,
              entityId: canonicalId(afterReference),
            });
      const stored = [...state.favorites];
      const current = stored.find((favorite) => keyOf(favorite) === targetKey);
      if (current === undefined) {
        fail("NOT_FOUND", "favorite");
      }
      const index = stored.indexOf(current);
      const previous = index > 0 ? (stored[index - 1] ?? null) : null;
      const previousKey = previous === null ? null : keyOf(previous);
      if (previousKey === afterKey) {
        return null;
      }
      const siblings = stored.filter((favorite) => keyOf(favorite) !== targetKey);
      if (afterKey === null) {
        state.favorites = [current, ...siblings];
        return null;
      }
      const anchor = siblings.findIndex((favorite) => keyOf(favorite) === afterKey);
      if (anchor === -1) {
        fail("INVALID_MOVE", "the reference favorite is not in the list");
      }
      state.favorites = [...siblings.slice(0, anchor + 1), current, ...siblings.slice(anchor + 1)];
      return null;
    },
  };
}
