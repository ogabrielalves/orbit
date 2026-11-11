import { describe, expect, it } from "vitest";
import type { FolderEntry } from "@/bindings";
import {
  buildFolderTree,
  countFoldersDeep,
  countNotesDeep,
  findFolderNode,
  flattenVisibleFolders,
  getAncestorPaths,
  isFolderEmpty,
  isPathInside,
} from "@/pages/notes/folderModel";

function folder(path: string, noteCount = 0): FolderEntry {
  return { path, name: path.split("/").pop() ?? path, noteCount };
}

const entries = [
  folder("work/plans", 2),
  folder("work", 1),
  folder("alpha", 0),
  folder("work/plans/q4", 3),
  folder("work/archive", 0),
];

describe("buildFolderTree", () => {
  it("nests the folders by path and sorts every level by name", () => {
    const tree = buildFolderTree(entries, "en");

    expect(tree.map((node) => node.entry.path)).toEqual(["alpha", "work"]);
    expect(tree[1]?.children.map((node) => node.entry.path)).toEqual([
      "work/archive",
      "work/plans",
    ]);
    expect(tree[1]?.children[1]?.children.map((node) => node.entry.path)).toEqual([
      "work/plans/q4",
    ]);
  });

  it("promotes a folder whose parent is missing to the root", () => {
    const tree = buildFolderTree([folder("orphan/child")], "en");

    expect(tree.map((node) => node.entry.path)).toEqual(["orphan/child"]);
  });
});

describe("tree helpers", () => {
  const tree = buildFolderTree(entries, "en");

  it("finds a node at any depth", () => {
    expect(findFolderNode(tree, "work/plans/q4")?.entry.noteCount).toBe(3);
    expect(findFolderNode(tree, "nope")).toBeUndefined();
  });

  it("counts the notes and folders inside a folder", () => {
    const work = findFolderNode(tree, "work");

    expect(work && countNotesDeep(work)).toBe(6);
    expect(work && countFoldersDeep(work)).toBe(3);
  });

  it("only treats a folder without notes and subfolders as empty", () => {
    expect(isFolderEmpty(findFolderNode(tree, "alpha") as never)).toBe(true);
    expect(isFolderEmpty(findFolderNode(tree, "work/archive") as never)).toBe(true);
    expect(isFolderEmpty(findFolderNode(tree, "work") as never)).toBe(false);
  });

  it("checks whether a path is inside a folder without matching prefixes", () => {
    expect(isPathInside("work/plans", "work")).toBe(true);
    expect(isPathInside("work", "work")).toBe(true);
    expect(isPathInside("workshop", "work")).toBe(false);
  });

  it("lists the ancestors of a path", () => {
    expect(getAncestorPaths("a/b/c")).toEqual(["a", "a/b"]);
    expect(getAncestorPaths("a")).toEqual([]);
    expect(getAncestorPaths("")).toEqual([]);
  });
});

describe("flattenVisibleFolders", () => {
  const roots = buildFolderTree(entries, "en");

  it("lists only the root folders when nothing is expanded", () => {
    const rows = flattenVisibleFolders(roots, new Set());

    expect(rows.map((row) => [row.node.entry.path, row.depth])).toEqual([
      ["alpha", 0],
      ["work", 0],
    ]);
  });

  it("lists the children of an expanded folder right after it with their depth", () => {
    const rows = flattenVisibleFolders(roots, new Set(["work"]));

    expect(rows.map((row) => [row.node.entry.path, row.depth])).toEqual([
      ["alpha", 0],
      ["work", 0],
      ["work/archive", 1],
      ["work/plans", 1],
    ]);
  });

  it("goes as deep as the expanded folders allow", () => {
    const rows = flattenVisibleFolders(roots, new Set(["work", "work/plans"]));

    expect(rows.map((row) => row.node.entry.path)).toEqual([
      "alpha",
      "work",
      "work/archive",
      "work/plans",
      "work/plans/q4",
    ]);
    expect(rows[4]?.depth).toBe(2);
  });

  it("ignores an expanded folder that is hidden by a collapsed parent", () => {
    const rows = flattenVisibleFolders(roots, new Set(["work/plans"]));

    expect(rows.map((row) => row.node.entry.path)).toEqual(["alpha", "work"]);
  });
});
