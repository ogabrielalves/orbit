import { describe, expect, it } from "vitest";
import type { FavoriteEntry } from "@/bindings";
import {
  applyFavoriteMove,
  favoriteKey,
  getFavoriteMove,
  groupFavorites,
  isFavorite,
} from "@/modules/favorites/favorites";

function entry(entityType: FavoriteEntry["entityType"], entityId: string): FavoriteEntry {
  return {
    entityType,
    entityId,
    title: entityId,
    context: null,
    projectId: null,
    boardId: null,
    parentTaskId: null,
    path: null,
    isArchived: false,
    createdAt: "2026-11-08T12:00:00Z",
  };
}

describe("favorites helpers", () => {
  it("keys a favorite by type and id", () => {
    expect(favoriteKey({ entityType: "note", entityId: "n1" })).toBe("note:n1");
  });

  it("tells whether a reference is a favorite", () => {
    const entries = [entry("project", "a")];

    expect(isFavorite(entries, { entityType: "project", entityId: "a" })).toBe(true);
    expect(isFavorite(entries, { entityType: "board", entityId: "a" })).toBe(false);
  });

  it("groups by type in the fixed order and drops empty groups", () => {
    const groups = groupFavorites([
      entry("folder", "f"),
      entry("project", "p1"),
      entry("note", "n"),
      entry("project", "p2"),
    ]);

    expect(groups.map((group) => group.type)).toEqual(["project", "note", "folder"]);
    expect(groups[0]?.entries.map((item) => item.entityId)).toEqual(["p1", "p2"]);
  });

  describe("moves", () => {
    const group = [entry("project", "a"), entry("project", "b"), entry("project", "c")];

    it("anchors a move forward after the target", () => {
      expect(getFavoriteMove(group, "project:a", "project:c")).toEqual({
        reference: { entityType: "project", entityId: "a" },
        afterReference: { entityType: "project", entityId: "c" },
      });
    });

    it("anchors a move backward after the item before the target", () => {
      expect(getFavoriteMove(group, "project:c", "project:b")).toEqual({
        reference: { entityType: "project", entityId: "c" },
        afterReference: { entityType: "project", entityId: "a" },
      });
    });

    it("moves to the top with a null anchor", () => {
      expect(getFavoriteMove(group, "project:c", "project:a")).toEqual({
        reference: { entityType: "project", entityId: "c" },
        afterReference: null,
      });
    });

    it("ignores dropping on itself or on an unknown item", () => {
      expect(getFavoriteMove(group, "project:a", "project:a")).toBeNull();
      expect(getFavoriteMove(group, "project:a", "project:zzz")).toBeNull();
    });

    it("applies a move to the whole list keeping other types in place", () => {
      const all = [entry("project", "a"), entry("note", "n"), entry("project", "b")];

      const result = applyFavoriteMove(all, {
        reference: { entityType: "project", entityId: "b" },
        afterReference: null,
      });

      expect(result.map(favoriteKey)).toEqual(["project:b", "project:a", "note:n"]);
    });
  });
});
