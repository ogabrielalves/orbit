import {
  type Announcements,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  type UniqueIdentifier,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { BoardColumn, Task } from "@/bindings";
import { getColumnMove } from "@/modules/boards/columns";
import { useMoveColumn } from "@/modules/boards/queries";
import { type DropTarget, getTaskMove } from "@/modules/tasks/moves";
import { useMoveTask } from "@/modules/tasks/queries";

type BoardDndParams = {
  boardId: string;
  columns: BoardColumn[];
  tasksByColumn: Map<string, Task[]> | undefined;
};

export function useBoardDnd({ boardId, columns, tasksByColumn }: BoardDndParams) {
  const { t } = useTranslation();
  const moveColumn = useMoveColumn(boardId);
  const moveTask = useMoveTask(boardId);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [overColumnId, setOverColumnId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const tasksById = new Map<string, Task>();
  for (const list of tasksByColumn?.values() ?? []) {
    for (const task of list) {
      tasksById.set(task.id, task);
    }
  }
  const activeTask = activeTaskId === null ? undefined : tasksById.get(activeTaskId);

  function isColumn(id: UniqueIdentifier): boolean {
    return columns.some((column) => column.id === id);
  }

  function requestColumnMove(activeId: string, overId: string) {
    const move = getColumnMove(columns, activeId, overId);
    const hasMove = move !== null;
    if (hasMove) {
      moveColumn.mutate({ id: move.columnId, afterColumnId: move.afterColumnId });
    }
  }

  function moveColumnBy(column: BoardColumn, offset: number) {
    const index = columns.findIndex((item) => item.id === column.id);
    const neighbor = columns[index + offset];
    const hasNeighbor = neighbor !== undefined;
    if (hasNeighbor) {
      requestColumnMove(column.id, neighbor.id);
    }
  }

  function toDropTarget({ active, over }: DragEndEvent): DropTarget | null {
    if (over === null) {
      return null;
    }
    if (isColumn(over.id)) {
      return { kind: "column", id: String(over.id) };
    }
    if (tasksById.has(String(over.id))) {
      const dragged = active.rect.current.translated;
      const isBelow =
        dragged !== null && dragged.top + dragged.height / 2 > over.rect.top + over.rect.height / 2;
      return { kind: "task", id: String(over.id), isBelow };
    }
    return null;
  }

  function resetTaskDrag() {
    setActiveTaskId(null);
    setOverColumnId(null);
  }

  function handleDragStart({ active }: DragStartEvent) {
    if (tasksById.has(String(active.id))) {
      setActiveTaskId(String(active.id));
    }
  }

  function handleDragOver({ active, over }: DragOverEvent) {
    if (!tasksById.has(String(active.id))) {
      return;
    }
    const overColumn = over === null ? null : (columnIdOf(over.id) ?? null);
    setOverColumnId(overColumn);
  }

  function handleDragEnd(event: DragEndEvent) {
    resetTaskDrag();
    const { active, over } = event;

    if (isColumn(active.id)) {
      const hasTarget = over !== null;
      if (hasTarget) {
        requestColumnMove(String(active.id), String(over.id));
      }
      return;
    }

    const target = toDropTarget(event);
    if (target === null || tasksByColumn === undefined) {
      return;
    }
    const move = getTaskMove(tasksByColumn, String(active.id), target);
    const hasMove = move !== null;
    if (hasMove) {
      moveTask.mutate({ id: move.taskId, columnId: move.columnId, afterTaskId: move.afterTaskId });
    }
  }

  function columnIdOf(id: UniqueIdentifier): string | undefined {
    if (isColumn(id)) {
      return String(id);
    }
    return tasksById.get(String(id))?.columnId ?? undefined;
  }

  function describeColumn(id: UniqueIdentifier, targetId: UniqueIdentifier = id) {
    const column = columns.find((item) => item.id === id);
    const position = columns.findIndex((item) => item.id === targetId) + 1;
    return { name: column?.name ?? "", position, total: columns.length };
  }

  function describeTask(id: UniqueIdentifier, overId: UniqueIdentifier = id) {
    const title = tasksById.get(String(id))?.title ?? "";
    const columnId = columnIdOf(overId);
    const column = columns.find((item) => item.id === columnId)?.name ?? "";
    return { title, column };
  }

  const isDraggingTask = (id: UniqueIdentifier) => tasksById.has(String(id));

  const announcements: Announcements = {
    onDragStart: ({ active }) =>
      isDraggingTask(active.id)
        ? t("boards.dnd.taskPicked", describeTask(active.id))
        : t("boards.dnd.picked", describeColumn(active.id)),
    onDragOver: ({ active, over }) => {
      const hasTarget = over !== null;
      if (!hasTarget) {
        return undefined;
      }
      return isDraggingTask(active.id)
        ? t("boards.dnd.taskOver", describeTask(active.id, over.id))
        : t("boards.dnd.moved", describeColumn(active.id, over.id));
    },
    onDragEnd: ({ active, over }) => {
      const hasTarget = over !== null;
      if (isDraggingTask(active.id)) {
        return hasTarget
          ? t("boards.dnd.taskDropped", describeTask(active.id, over.id))
          : t("boards.dnd.taskCancelled", describeTask(active.id));
      }
      return hasTarget
        ? t("boards.dnd.dropped", describeColumn(active.id, over.id))
        : t("boards.dnd.cancelled", describeColumn(active.id));
    },
    onDragCancel: ({ active }) =>
      isDraggingTask(active.id)
        ? t("boards.dnd.taskCancelled", describeTask(active.id))
        : t("boards.dnd.cancelled", describeColumn(active.id)),
  };

  return {
    sensors,
    announcements,
    activeTask,
    overColumnId,
    moveColumnBy,
    handlers: {
      onDragStart: handleDragStart,
      onDragOver: handleDragOver,
      onDragEnd: handleDragEnd,
      onDragCancel: resetTaskDrag,
    },
  };
}
