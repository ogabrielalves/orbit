import { describe, expect, it } from "vitest";
import { applyReorder, getReorder } from "@/lib/reorder";

const ids = ["a", "b", "c", "d"];
const items = ids.map((id) => ({ id }));

describe("getReorder", () => {
  it("moving forward lands after the item it was dropped on", () => {
    expect(getReorder(ids, "a", "c")).toEqual({ id: "a", afterId: "c" });
  });

  it("moving back lands before the item it was dropped on", () => {
    expect(getReorder(ids, "d", "b")).toEqual({ id: "d", afterId: "a" });
    expect(getReorder(ids, "c", "a")).toEqual({ id: "c", afterId: null });
  });

  it("does nothing for the same place or unknown ids", () => {
    expect(getReorder(ids, "b", "b")).toBeNull();
    expect(getReorder(ids, "x", "b")).toBeNull();
    expect(getReorder(ids, "b", "x")).toBeNull();
  });
});

describe("applyReorder", () => {
  function order(result: { id: string }[]): string[] {
    return result.map((item) => item.id);
  }

  it("moves an item to the top, the middle and the end", () => {
    expect(order(applyReorder(items, { id: "c", afterId: null }))).toEqual(["c", "a", "b", "d"]);
    expect(order(applyReorder(items, { id: "a", afterId: "b" }))).toEqual(["b", "a", "c", "d"]);
    expect(order(applyReorder(items, { id: "a", afterId: "d" }))).toEqual(["b", "c", "d", "a"]);
  });

  it("keeps the list for unknown items or anchors and never mutates it", () => {
    expect(applyReorder(items, { id: "x", afterId: null })).toBe(items);
    expect(applyReorder(items, { id: "a", afterId: "x" })).toBe(items);
    expect(order(items)).toEqual(ids);
  });
});
