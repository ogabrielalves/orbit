import type { BoardColumn } from "@/bindings";

export function moveColumnAfter(
  columns: BoardColumn[],
  columnId: string,
  afterColumnId: string | null,
): BoardColumn[] {
  const movedColumn = columns.find((column) => column.id === columnId);
  const isKnownColumn = movedColumn !== undefined;
  if (!isKnownColumn) {
    return columns;
  }

  const remaining = columns.filter((column) => column.id !== columnId);
  const isFirst = afterColumnId === null;
  if (isFirst) {
    return [movedColumn, ...remaining];
  }

  const anchorIndex = remaining.findIndex((column) => column.id === afterColumnId);
  const isKnownAnchor = anchorIndex !== -1;
  if (!isKnownAnchor) {
    return columns;
  }

  return [...remaining.slice(0, anchorIndex + 1), movedColumn, ...remaining.slice(anchorIndex + 1)];
}

export type ColumnMove = {
  columnId: string;
  afterColumnId: string | null;
};

export function getColumnMove(
  columns: BoardColumn[],
  activeId: string,
  overId: string,
): ColumnMove | null {
  const oldIndex = columns.findIndex((column) => column.id === activeId);
  const newIndex = columns.findIndex((column) => column.id === overId);
  const isUnknown = oldIndex === -1 || newIndex === -1;
  const isSamePlace = oldIndex === newIndex;
  if (isUnknown || isSamePlace) {
    return null;
  }

  const isMovingForward = newIndex > oldIndex;
  const anchorIndex = isMovingForward ? newIndex : newIndex - 1;
  const anchor = columns[anchorIndex];
  const hasAnchor = anchor !== undefined;
  const afterColumnId = hasAnchor ? anchor.id : null;

  return { columnId: activeId, afterColumnId };
}
