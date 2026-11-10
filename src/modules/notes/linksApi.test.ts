import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchNoteLinks, resolveNoteLink } from "@/modules/notes/linksApi";

const commands = vi.hoisted(() => ({
  resolveNoteLink: vi.fn(),
  getNoteLinks: vi.fn(),
}));

vi.mock("@/bindings", () => ({ commands }));

describe("notes links api", () => {
  beforeEach(() => {
    for (const command of Object.values(commands)) {
      command.mockReset();
    }
  });

  it("resolves a link target and returns the matching note", async () => {
    commands.resolveNoteLink.mockResolvedValue({ status: "ok", data: { id: "n1" } });

    await expect(resolveNoteLink("Plan")).resolves.toEqual({ id: "n1" });
    expect(commands.resolveNoteLink).toHaveBeenCalledWith("Plan");
  });

  it("returns null when no note matches the target", async () => {
    commands.resolveNoteLink.mockResolvedValue({ status: "ok", data: null });

    await expect(resolveNoteLink("Missing")).resolves.toBeNull();
  });

  it("reads the links of a note", async () => {
    commands.getNoteLinks.mockResolvedValue({
      status: "ok",
      data: { outgoing: [], backlinks: [] },
    });

    await expect(fetchNoteLinks("n1")).resolves.toEqual({ outgoing: [], backlinks: [] });
    expect(commands.getNoteLinks).toHaveBeenCalledWith("n1");
  });

  it("throws the command error", async () => {
    const error = { code: "not_found", message: "missing" };
    commands.getNoteLinks.mockResolvedValue({ status: "error", error });

    await expect(fetchNoteLinks("n1")).rejects.toEqual(error);
  });
});
