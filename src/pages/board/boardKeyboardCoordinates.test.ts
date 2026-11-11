import type { ClientRect, DroppableContainer, KeyboardCoordinateGetter } from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { boardKeyboardCoordinates } from "@/pages/board/boardCollision";

vi.mock("@dnd-kit/sortable", () => ({ sortableKeyboardCoordinates: vi.fn() }));

const delegate = vi.mocked(sortableKeyboardCoordinates);

type GetterArgs = Parameters<KeyboardCoordinateGetter>[1];
type GetterContext = GetterArgs["context"];

class FakeContainers extends Map<string, DroppableContainer> {
  getEnabled(): DroppableContainer[] {
    return [...this.values()].filter((entry) => !entry.disabled);
  }
}

function container(
  id: string,
  data: Record<string, unknown>,
  disabled = false,
): DroppableContainer {
  return { id, data: { current: data }, disabled } as unknown as DroppableContainer;
}

function rect(left: number, top: number, width: number, height: number): ClientRect {
  return { left, top, width, height, right: left + width, bottom: top + height };
}

function createContainers(extra: DroppableContainer[] = []) {
  const containers = new FakeContainers();
  const entries = [
    container("c1", { type: "column" }),
    container("c2", { type: "column" }),
    container("a", { type: "task", columnId: "c1" }),
    container("x", { type: "task", columnId: "c2" }),
    ...extra,
  ];
  for (const entry of entries) {
    containers.set(String(entry.id), entry);
  }
  return containers;
}

function createArgs(activeType: string | null, containers = createContainers()) {
  const collisionRect = rect(0, 0, 300, 600);
  const droppableRects = new Map([["c1", collisionRect]]);
  const active = activeType === null ? null : { id: "c1", data: { current: { type: activeType } } };
  const context = {
    active,
    activeNode: null,
    collisionRect,
    droppableRects,
    droppableContainers: containers,
    over: { id: "c1" },
    scrollableAncestors: [],
  } as unknown as GetterContext;
  const args = {
    active: "c1",
    currentCoordinates: { x: 10, y: 20 },
    context,
  } as unknown as GetterArgs;
  return { args, context, containers };
}

const event = new KeyboardEvent("keydown", { code: "ArrowRight" });

function delegatedContext(): GetterContext {
  const call = delegate.mock.calls[0];
  if (call === undefined) {
    throw new Error("the sortable getter was not called");
  }
  return (call[1] as GetterArgs).context;
}

describe("boardKeyboardCoordinates", () => {
  beforeEach(() => {
    delegate.mockReset();
    delegate.mockReturnValue({ x: 316, y: 0 });
  });

  it("hands a card drag to the sortable getter untouched", () => {
    const { args } = createArgs("task");

    const result = boardKeyboardCoordinates(event, args);

    expect(delegate).toHaveBeenCalledTimes(1);
    expect(delegate).toHaveBeenCalledWith(event, args);
    expect(result).toEqual({ x: 316, y: 0 });
  });

  it("hands over the call untouched when nothing is being dragged", () => {
    const { args } = createArgs(null);

    boardKeyboardCoordinates(event, args);

    expect(delegate).toHaveBeenCalledWith(event, args);
  });

  it("only offers the columns as targets while a column is dragged", () => {
    const { args } = createArgs("column");

    boardKeyboardCoordinates(event, args);

    const enabled = delegatedContext().droppableContainers.getEnabled();
    expect(enabled.map((entry) => entry.id)).toEqual(["c1", "c2"]);
  });

  it("keeps the disabled columns out", () => {
    const containers = createContainers([container("c3", { type: "column" }, true)]);
    const { args } = createArgs("column", containers);

    boardKeyboardCoordinates(event, args);

    const ids = delegatedContext()
      .droppableContainers.getEnabled()
      .map((entry) => entry.id);
    expect(ids).toEqual(["c1", "c2"]);
  });

  it("still resolves every container by id, cards included", () => {
    const { args, containers } = createArgs("column");

    boardKeyboardCoordinates(event, args);

    const restricted = delegatedContext().droppableContainers;
    expect(restricted.get("c1")).toBe(containers.get("c1"));
    expect(restricted.get("a")).toBe(containers.get("a"));
    expect(restricted.has("x")).toBe(true);
    expect(restricted.size).toBe(4);
  });

  it("keeps the rest of the drag context and the call arguments", () => {
    const { args, context } = createArgs("column");

    boardKeyboardCoordinates(event, args);

    const [receivedEvent, receivedArgs] = delegate.mock.calls[0] as [KeyboardEvent, GetterArgs];
    expect(receivedEvent).toBe(event);
    expect(receivedArgs.currentCoordinates).toEqual({ x: 10, y: 20 });
    expect(receivedArgs.context.collisionRect).toBe(context.collisionRect);
    expect(receivedArgs.context.droppableRects).toBe(context.droppableRects);
    expect(receivedArgs.context.over).toBe(context.over);
    expect(receivedArgs.context.scrollableAncestors).toBe(context.scrollableAncestors);
    expect(receivedArgs.context.active).toBe(context.active);
  });

  it("returns what the sortable getter decides, including no movement", () => {
    delegate.mockReturnValueOnce(undefined);
    const { args } = createArgs("column");

    expect(boardKeyboardCoordinates(event, args)).toBeUndefined();

    delegate.mockReturnValueOnce({ x: 596, y: 0 });
    expect(boardKeyboardCoordinates(event, createArgs("column").args)).toEqual({ x: 596, y: 0 });
  });

  it("does not change the original container map", () => {
    const { args, containers } = createArgs("column");

    boardKeyboardCoordinates(event, args);

    expect(containers.getEnabled().map((entry) => entry.id)).toEqual(["c1", "c2", "a", "x"]);
    expect(args.context.droppableContainers).toBe(containers);
  });
});
