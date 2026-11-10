import { describe, expect, it } from "vitest";
import { parseNotesSearch } from "@/pages/notes/notesSearch";

describe("parseNotesSearch", () => {
  it("keeps a folder path", () => {
    expect(parseNotesSearch({ folder: "work/plans" })).toEqual({ folder: "work/plans" });
  });

  it("drops empty and invalid values", () => {
    expect(parseNotesSearch({ folder: "" })).toEqual({ folder: undefined });
    expect(parseNotesSearch({ folder: 3 })).toEqual({ folder: undefined });
    expect(parseNotesSearch({})).toEqual({ folder: undefined });
  });
});
