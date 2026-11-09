import type { Active, ClientRect, DroppableContainer } from "@dnd-kit/core";
import { describe, expect, it } from "vitest";
import { boardCollisionDetection } from "@/pages/board/boardCollision";

function rect(left: number, top: number, width: number, height: number): ClientRect {
  return { left, top, width, height, right: left + width, bottom: top + height };
}

function container(id: string, data: Record<string, unknown>): DroppableContainer {
  return { id, data: { current: data } } as unknown as DroppableContainer;
}

const rects = new Map<string, ClientRect>([
  ["c1", rect(0, 0, 300, 600)],
  ["c2", rect(320, 0, 300, 600)],
  ["a", rect(10, 50, 280, 60)],
  ["b", rect(10, 120, 280, 60)],
  ["x", rect(330, 50, 280, 60)],
]);

const droppableContainers = [
  container("c1", { type: "column" }),
  container("c2", { type: "column" }),
  container("a", { type: "task", columnId: "c1" }),
  container("b", { type: "task", columnId: "c1" }),
  container("x", { type: "task", columnId: "c2" }),
];

function detect(
  activeId: string,
  activeType: string,
  collisionRect: ClientRect,
  pointer: { x: number; y: number } | null,
) {
  const active = { id: activeId, data: { current: { type: activeType } } } as unknown as Active;
  return boardCollisionDetection({
    active,
    collisionRect,
    droppableRects: rects as never,
    droppableContainers,
    pointerCoordinates: pointer,
  }).map((collision) => collision.id);
}

describe("boardCollisionDetection", () => {
  it("lets a column collide only with columns", () => {
    const ids = detect("c1", "column", rect(300, 0, 300, 600), { x: 450, y: 300 });

    expect(ids[0]).toBe("c2");
    expect(ids).not.toContain("a");
    expect(ids).not.toContain("x");
  });

  it("picks the nearest card of the column under the pointer", () => {
    const ids = detect("x", "task", rect(10, 125, 280, 60), { x: 150, y: 150 });

    expect(ids[0]).toBe("b");
  });

  it("never picks a card of another column while the pointer is over this one", () => {
    const ids = detect("x", "task", rect(10, 55, 280, 60), { x: 150, y: 80 });

    expect(ids).not.toContain("x");
    expect(ids[0]).toBe("a");
  });

  it("falls back to the column when it has no cards", () => {
    const empty = [container("c1", { type: "column" }), container("c3", { type: "column" })];
    const active = { id: "a", data: { current: { type: "task" } } } as unknown as Active;
    const ids = boardCollisionDetection({
      active,
      collisionRect: rect(650, 100, 280, 60),
      droppableRects: new Map([
        ["c1", rect(0, 0, 300, 600)],
        ["c3", rect(640, 0, 300, 600)],
      ]) as never,
      droppableContainers: empty,
      pointerCoordinates: { x: 700, y: 300 },
    }).map((collision) => collision.id);

    expect(ids).toEqual(["c3"]);
  });

  it("has no collision when the pointer is outside every column", () => {
    expect(detect("a", "task", rect(900, 900, 280, 60), { x: 1000, y: 1000 })).toEqual([]);
  });

  it("uses the nearest card or column for the keyboard and skips the dragged card", () => {
    const ids = detect("a", "task", rect(10, 125, 280, 60), null);

    expect(ids[0]).toBe("b");
    expect(ids).not.toContain("a");
  });
});
