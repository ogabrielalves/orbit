import { describe, expect, it } from "vitest";
import type { BoardColumn } from "@/bindings";
import { getColumnMove, moveColumnAfter } from "@/modules/boards/columns";

function column(id: string): BoardColumn {
  return {
    id,
    boardId: "b1",
    name: id.toUpperCase(),
    position: id,
    color: null,
    kind: "todo",
    createdAt: "2026-11-08T10:00:00Z",
    updatedAt: "2026-11-08T10:00:00Z",
    taskCount: 0,
  };
}

const columns = ["a", "b", "c", "d"].map(column);

function ids(list: BoardColumn[]): string[] {
  return list.map((item) => item.id);
}

describe("moveColumnAfter", () => {
  it("moves a column right after the given one", () => {
    expect(ids(moveColumnAfter(columns, "a", "c"))).toEqual(["b", "c", "a", "d"]);
  });

  it("moves a column to the end", () => {
    expect(ids(moveColumnAfter(columns, "a", "d"))).toEqual(["b", "c", "d", "a"]);
  });

  it("makes a column the first one when there is no column before it", () => {
    expect(ids(moveColumnAfter(columns, "c", null))).toEqual(["c", "a", "b", "d"]);
  });

  it("moves a column backwards", () => {
    expect(ids(moveColumnAfter(columns, "d", "a"))).toEqual(["a", "d", "b", "c"]);
  });

  it("keeps the order when the column is already there", () => {
    expect(ids(moveColumnAfter(columns, "b", "a"))).toEqual(["a", "b", "c", "d"]);
  });

  it("leaves the list alone for an unknown column or anchor", () => {
    expect(moveColumnAfter(columns, "x", "a")).toBe(columns);
    expect(moveColumnAfter(columns, "a", "x")).toBe(columns);
  });

  it("does not change the original list", () => {
    moveColumnAfter(columns, "a", "d");

    expect(ids(columns)).toEqual(["a", "b", "c", "d"]);
  });

  it("keeps the data of every column", () => {
    const moved = moveColumnAfter(columns, "a", "c");

    expect(moved.find((item) => item.id === "a")).toBe(columns[0]);
  });
});

describe("getColumnMove", () => {
  it("anchors on the column that was dropped over when moving forward", () => {
    expect(getColumnMove(columns, "a", "c")).toEqual({ columnId: "a", afterColumnId: "c" });
  });

  it("anchors on the column before the target when moving backward", () => {
    expect(getColumnMove(columns, "d", "b")).toEqual({ columnId: "d", afterColumnId: "a" });
  });

  it("asks for the first place when dropped over the first column", () => {
    expect(getColumnMove(columns, "c", "a")).toEqual({ columnId: "c", afterColumnId: null });
  });

  it("moves to the end when dropped over the last column", () => {
    expect(getColumnMove(columns, "a", "d")).toEqual({ columnId: "a", afterColumnId: "d" });
  });

  it("does nothing when dropped over itself", () => {
    expect(getColumnMove(columns, "b", "b")).toBeNull();
  });

  it("does nothing for an unknown column", () => {
    expect(getColumnMove(columns, "x", "a")).toBeNull();
    expect(getColumnMove(columns, "a", "x")).toBeNull();
  });

  it.each([
    ["a", "b"],
    ["a", "c"],
    ["a", "d"],
    ["b", "a"],
    ["c", "a"],
    ["d", "a"],
    ["d", "b"],
    ["b", "d"],
    ["c", "b"],
  ])("agrees with the move of %s over %s once applied", (activeId, overId) => {
    const move = getColumnMove(columns, activeId, overId);
    const reordered = moveColumnAfter(columns, activeId, move?.afterColumnId ?? null);

    expect(reordered.findIndex((item) => item.id === activeId)).toBe(
      columns.findIndex((item) => item.id === overId),
    );
  });
});
