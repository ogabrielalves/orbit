import type { BacklogItem } from "@/bindings";

export type BacklogMove = {
  taskId: string;
  afterTaskId: string | null;
};

export function applyBacklogMove(
  items: BacklogItem[],
  taskId: string,
  afterTaskId: string | null,
): BacklogItem[] {
  const moving = items.find((item) => item.task.id === taskId);
  if (moving === undefined) {
    return items;
  }

  const rest = items.filter((item) => item.task.id !== taskId);
  const hasAnchor = afterTaskId !== null;
  const anchorIndex = hasAnchor ? rest.findIndex((item) => item.task.id === afterTaskId) : -1;
  const firstOfProject = rest.findIndex((item) => item.task.projectId === moving.task.projectId);
  const projectStart = firstOfProject === -1 ? rest.length : firstOfProject;
  const insertIndex = anchorIndex === -1 ? projectStart : anchorIndex + 1;

  return [...rest.slice(0, insertIndex), moving, ...rest.slice(insertIndex)];
}

export function getBacklogMove(
  items: BacklogItem[],
  activeId: string,
  overId: string,
): BacklogMove | null {
  const activeIndex = items.findIndex((item) => item.task.id === activeId);
  const overIndex = items.findIndex((item) => item.task.id === overId);
  const active = items[activeIndex];
  const over = items[overIndex];
  const isKnown = active !== undefined && over !== undefined;
  if (!isKnown || activeIndex === overIndex) {
    return null;
  }

  const isOtherProject = active.task.projectId !== over.task.projectId;
  if (isOtherProject) {
    return null;
  }

  const isMovingDown = activeIndex < overIndex;
  const rest = items.filter((item) => item.task.id !== activeId);
  const overIndexInRest = rest.findIndex((item) => item.task.id === overId);
  const predecessor = isMovingDown ? over : rest[overIndexInRest - 1];
  const hasSameProjectPredecessor =
    predecessor !== undefined && predecessor.task.projectId === active.task.projectId;
  const afterTaskId = hasSameProjectPredecessor ? predecessor.task.id : null;

  const next = applyBacklogMove(items, activeId, afterTaskId);
  const hasChanged = next.some((item, index) => item.task.id !== items[index]?.task.id);
  return hasChanged ? { taskId: activeId, afterTaskId } : null;
}
