import type { BoardColumn, Task } from "@/bindings";
import { groupTasksByColumn } from "@/modules/tasks/grouping";

export type TaskMove = {
  taskId: string;
  columnId: string;
  afterTaskId: string | null;
};

export type DropTarget =
  | { kind: "task"; id: string; isBelow: boolean }
  | { kind: "column"; id: string };

type Location = { columnId: string; index: number };

function locate(groups: Map<string, Task[]>, taskId: string): Location | null {
  for (const [columnId, list] of groups) {
    const index = list.findIndex((task) => task.id === taskId);
    if (index !== -1) {
      return { columnId, index };
    }
  }
  return null;
}

// Turns "dropped here" into the (column, afterTaskId) pair the backend expects.
// `isBelow` only matters when the card changes column; inside one column the direction of
// the drag decides, like an array move.
export function getTaskMove(
  groups: Map<string, Task[]>,
  activeId: string,
  target: DropTarget,
): TaskMove | null {
  const source = locate(groups, activeId);
  if (source === null) {
    return null;
  }

  const isOverItself = target.kind === "task" && target.id === activeId;
  if (isOverItself) {
    return null;
  }

  const targetLocation = target.kind === "task" ? locate(groups, target.id) : null;
  const targetColumnId = target.kind === "column" ? target.id : targetLocation?.columnId;
  const isUnknownTarget = targetColumnId === undefined;
  if (isUnknownTarget) {
    return null;
  }

  const remaining = (groups.get(targetColumnId) ?? []).filter((task) => task.id !== activeId);
  const isSameColumn = targetColumnId === source.columnId;

  let insertIndex = remaining.length;
  if (target.kind === "task" && targetLocation !== null) {
    const overIndex = remaining.findIndex((task) => task.id === target.id);
    const isBelow = isSameColumn ? source.index < targetLocation.index : target.isBelow;
    insertIndex = isBelow ? overIndex + 1 : overIndex;
  }

  const afterTaskId = insertIndex === 0 ? null : (remaining[insertIndex - 1]?.id ?? null);
  const currentPredecessor = groups.get(source.columnId)?.[source.index - 1]?.id ?? null;
  const isAlreadyThere = isSameColumn && afterTaskId === currentPredecessor;
  if (isAlreadyThere) {
    return null;
  }

  return { taskId: activeId, columnId: targetColumnId, afterTaskId };
}

function syntheticPosition(index: number): string {
  return String(index).padStart(6, "0");
}

// Optimistic version of the move. The real fractional positions only come back from the
// backend, so the target column gets throwaway positions that keep the order until the refetch.
export function applyTaskMove(tasks: Task[], move: TaskMove): Task[] {
  const groups = groupTasksByColumn(tasks);
  const moved = tasks.find((task) => task.id === move.taskId);
  if (moved === undefined) {
    return tasks;
  }

  const target = (groups.get(move.columnId) ?? []).filter((task) => task.id !== move.taskId);
  const anchorIndex =
    move.afterTaskId === null ? -1 : target.findIndex((task) => task.id === move.afterTaskId);
  const isUnknownAnchor = move.afterTaskId !== null && anchorIndex === -1;
  const insertIndex = isUnknownAnchor ? target.length : anchorIndex + 1;

  const reordered = [
    ...target.slice(0, insertIndex),
    { ...moved, columnId: move.columnId },
    ...target.slice(insertIndex),
  ].map((task, index) => ({ ...task, position: syntheticPosition(index) }));
  const reorderedById = new Map(reordered.map((task) => [task.id, task]));

  const untouched = tasks.filter((task) => !reorderedById.has(task.id));
  return [...untouched, ...reordered];
}

export function shiftTaskCount(
  columns: BoardColumn[],
  fromColumnId: string,
  toColumnId: string,
): BoardColumn[] {
  if (fromColumnId === toColumnId) {
    return columns;
  }

  return columns.map((column) => {
    if (column.id === fromColumnId) {
      return { ...column, taskCount: Math.max(0, column.taskCount - 1) };
    }
    if (column.id === toColumnId) {
      return { ...column, taskCount: column.taskCount + 1 };
    }
    return column;
  });
}
