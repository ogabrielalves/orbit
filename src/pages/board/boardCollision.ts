import {
  type CollisionDetection,
  closestCenter,
  type DroppableContainer,
  pointerWithin,
} from "@dnd-kit/core";

export type BoardDragType = "column" | "task";

function ofType(containers: DroppableContainer[], type: BoardDragType): DroppableContainer[] {
  return containers.filter((container) => container.data.current?.type === type);
}

// Columns only collide with columns. A card follows the pointer to the column under it and then
// picks the nearest card in that column (or the column itself when it has none).
// With the keyboard there is no pointer, so the nearest column or card wins.
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
