import {
  type CollisionDetection,
  closestCenter,
  type DroppableContainer,
  type KeyboardCoordinateGetter,
  pointerWithin,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";

export type BoardDragType = "column" | "task";

function ofType(containers: DroppableContainer[], type: BoardDragType): DroppableContainer[] {
  return containers.filter((container) => container.data.current?.type === type);
}

export const boardCollisionDetection: CollisionDetection = (args) => {
  const { active, droppableContainers, pointerCoordinates } = args;
  const isDraggingColumn = active.data.current?.type === "column";
  if (isDraggingColumn) {
    return closestCenter({ ...args, droppableContainers: ofType(droppableContainers, "column") });
  }

  const isUsingKeyboard = pointerCoordinates === null;
  if (isUsingKeyboard) {
    return closestCenter({
      ...args,
      droppableContainers: droppableContainers.filter((container) => container.id !== active.id),
    });
  }

  const columns = ofType(droppableContainers, "column");
  const columnHit = pointerWithin({ ...args, droppableContainers: columns })[0];
  if (columnHit === undefined) {
    return [];
  }

  const cardsInColumn = ofType(droppableContainers, "task").filter(
    (container) => container.data.current?.columnId === columnHit.id,
  );
  const cardHit = closestCenter({ ...args, droppableContainers: cardsInColumn })[0];

  return cardHit === undefined ? [columnHit] : [cardHit];
};

export const boardKeyboardCoordinates: KeyboardCoordinateGetter = (event, args) => {
  const { context } = args;
  const isDraggingColumn = context.active?.data.current?.type === "column";
  if (!isDraggingColumn) {
    return sortableKeyboardCoordinates(event, args);
  }
  const columns = context.droppableContainers
    .getEnabled()
    .filter((container) => container.data.current?.type === "column");
  const original = context.droppableContainers;
  const droppableContainers = new Proxy(original, {
    get(target, property) {
      if (property === "getEnabled") {
        return () => columns;
      }
      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  const restricted = { ...context, droppableContainers };
  return sortableKeyboardCoordinates(event, {
    ...args,
    context: restricted as unknown as typeof context,
  });
};
