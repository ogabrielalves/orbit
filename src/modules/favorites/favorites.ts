import type { FavoriteEntry, FavoriteRef, FavoriteType } from "@/bindings";
import { applyReorder, getReorder } from "@/lib/reorder";

export const favoriteTypes: FavoriteType[] = ["project", "board", "task", "note", "folder"];

export type FavoriteGroup = {
  type: FavoriteType;
  entries: FavoriteEntry[];
};

export type FavoriteMove = {
  reference: FavoriteRef;
  afterReference: FavoriteRef | null;
};

export function favoriteKey(reference: FavoriteRef): string {
  return `${reference.entityType}:${reference.entityId}`;
}

export function isFavorite(entries: FavoriteEntry[], reference: FavoriteRef): boolean {
  const key = favoriteKey(reference);
  return entries.some((entry) => favoriteKey(entry) === key);
}

export function groupFavorites(entries: FavoriteEntry[]): FavoriteGroup[] {
  return favoriteTypes
    .map((type) => ({ type, entries: entries.filter((entry) => entry.entityType === type) }))
    .filter((group) => group.entries.length > 0);
}

function toReference(entry: FavoriteEntry): FavoriteRef {
  return { entityType: entry.entityType, entityId: entry.entityId };
}

export function getFavoriteMove(
  groupEntries: FavoriteEntry[],
  activeKey: string,
  overKey: string,
): FavoriteMove | null {
  const keys = groupEntries.map(favoriteKey);
  const reorder = getReorder(keys, activeKey, overKey);
  if (reorder === null) {
    return null;
  }

  const active = groupEntries.find((entry) => favoriteKey(entry) === reorder.id);
  const anchor = groupEntries.find((entry) => favoriteKey(entry) === reorder.afterId);
  if (active === undefined) {
    return null;
  }
  return {
    reference: toReference(active),
    afterReference: anchor === undefined ? null : toReference(anchor),
  };
}

export function applyFavoriteMove(entries: FavoriteEntry[], move: FavoriteMove): FavoriteEntry[] {
  const items = entries.map((entry) => ({ id: favoriteKey(entry), entry }));
  const afterId = move.afterReference === null ? null : favoriteKey(move.afterReference);
  return applyReorder(items, { id: favoriteKey(move.reference), afterId }).map(
    (item) => item.entry,
  );
}
