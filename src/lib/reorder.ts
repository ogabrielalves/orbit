export type Reorder = {
  id: string;
  afterId: string | null;
};

export function getReorder(ids: string[], activeId: string, overId: string): Reorder | null {
  const oldIndex = ids.indexOf(activeId);
  const newIndex = ids.indexOf(overId);
  const isUnknown = oldIndex === -1 || newIndex === -1;
  const isSamePlace = oldIndex === newIndex;
  if (isUnknown || isSamePlace) {
    return null;
  }

  const isMovingForward = newIndex > oldIndex;
  const anchorIndex = isMovingForward ? newIndex : newIndex - 1;
  const afterId = ids[anchorIndex] ?? null;

  return { id: activeId, afterId };
}

export function applyReorder<TItem extends { id: string }>(
  items: TItem[],
  reorder: Reorder,
): TItem[] {
  const moved = items.find((item) => item.id === reorder.id);
  if (moved === undefined) {
    return items;
  }

  const remaining = items.filter((item) => item.id !== reorder.id);
  const isFirst = reorder.afterId === null;
  if (isFirst) {
    return [moved, ...remaining];
  }

  const anchorIndex = remaining.findIndex((item) => item.id === reorder.afterId);
  const isUnknownAnchor = anchorIndex === -1;
  if (isUnknownAnchor) {
    return items;
  }

  return [...remaining.slice(0, anchorIndex + 1), moved, ...remaining.slice(anchorIndex + 1)];
}
