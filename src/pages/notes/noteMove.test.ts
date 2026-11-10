import { describe, expect, it } from "vitest";
import {
  type DragSource,
  parentFolderOf,
  remapPathAfterMove,
  resolveMove,
} from "@/pages/notes/noteMove";

const note: DragSource = { kind: "note", id: "n1", name: "Plan", folderPath: "Work" };
const folder: DragSource = { kind: "folder", path: "Work/Docs", name: "Docs" };

describe("parentFolderOf", () => {
  it("returns the parent path or an empty string at the root", () => {
    expect(parentFolderOf("Work/Docs")).toBe("Work");
    expect(parentFolderOf("Work")).toBe("");
  });
});

describe("resolveMove for notes", () => {
  it("moves a note into another folder", () => {
    expect(resolveMove(note, "Personal")).toEqual({
      kind: "note",
      id: "n1",
      name: "Plan",
      newFolderPath: "Personal",
    });
  });

  it("moves a note to the vault root with a null folder", () => {
    expect(resolveMove(note, "")).toMatchObject({ kind: "note", newFolderPath: null });
  });

  it("ignores a drop on the folder the note already lives in", () => {
    expect(resolveMove(note, "Work")).toBeNull();
    expect(resolveMove({ ...note, folderPath: "" }, "")).toBeNull();
  });
});

describe("resolveMove for folders", () => {
  it("moves a folder under another folder", () => {
    expect(resolveMove(folder, "Personal")).toEqual({
      kind: "folder",
      path: "Work/Docs",
      name: "Docs",
      newParentPath: "Personal",
    });
  });

  it("moves a folder to the vault root with a null parent", () => {
    expect(resolveMove(folder, "")).toMatchObject({ kind: "folder", newParentPath: null });
  });

  it("rejects dropping a folder into itself or its descendants", () => {
    expect(resolveMove(folder, "Work/Docs")).toBeNull();
    expect(resolveMove(folder, "Work/Docs/Deep")).toBeNull();
  });

  it("allows a sibling whose name only shares a prefix", () => {
    expect(resolveMove(folder, "Work/Docs2")).not.toBeNull();
  });

  it("ignores a drop on the current parent", () => {
    expect(resolveMove(folder, "Work")).toBeNull();
    expect(resolveMove({ kind: "folder", path: "Work", name: "Work" }, "")).toBeNull();
  });
});

describe("remapPathAfterMove", () => {
  it("rewrites a selected path inside the moved folder", () => {
    expect(remapPathAfterMove("Work/Docs/Deep", "Work/Docs", "Personal/Docs")).toBe(
      "Personal/Docs/Deep",
    );
    expect(remapPathAfterMove("Work/Docs", "Work/Docs", "Personal/Docs")).toBe("Personal/Docs");
  });

  it("returns null when the selection is elsewhere", () => {
    expect(remapPathAfterMove("Other", "Work/Docs", "Personal/Docs")).toBeNull();
    expect(remapPathAfterMove("Work/Docs2", "Work/Docs", "Personal/Docs")).toBeNull();
  });
});
