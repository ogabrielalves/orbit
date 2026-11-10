import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createNote,
  deleteNote,
  fetchNote,
  fetchNotes,
  fetchVaultStatus,
  moveNote,
  renameNote,
  saveNote,
  setupVault,
} from "@/modules/notes/api";

const commands = vi.hoisted(() => ({
  getVaultStatus: vi.fn(),
  setupVault: vi.fn(),
  listNotes: vi.fn(),
  getNote: vi.fn(),
  createNote: vi.fn(),
  saveNote: vi.fn(),
  renameNote: vi.fn(),
  moveNote: vi.fn(),
  deleteNote: vi.fn(),
}));

vi.mock("@/bindings", () => ({ commands }));

describe("notes api", () => {
  beforeEach(() => {
    for (const command of Object.values(commands)) {
      command.mockReset();
      command.mockResolvedValue({ status: "ok", data: "result" });
    }
  });

  it("reads the vault status and sets the vault up", async () => {
    await expect(fetchVaultStatus()).resolves.toBe("result");
    await expect(setupVault({ path: "C:\\notes", create: true })).resolves.toBe("result");

    expect(commands.setupVault).toHaveBeenCalledWith({ path: "C:\\notes", create: true });
  });

  it("lists and reads notes", async () => {
    await fetchNotes({ folderPath: "ideas", includeSubfolders: true });
    await fetchNote("n1");

    expect(commands.listNotes).toHaveBeenCalledWith({
      folderPath: "ideas",
      includeSubfolders: true,
    });
    expect(commands.getNote).toHaveBeenCalledWith("n1");
  });

  it("creates, saves, renames, moves and deletes notes", async () => {
    await createNote({ title: "Plan", folderPath: "ideas" });
    await saveNote("n1", { content: "text", baseHash: "h1", force: true });
    await renameNote("n1", "New");
    await moveNote("n1", null);
    await deleteNote("n1");

    expect(commands.createNote).toHaveBeenCalledWith({ title: "Plan", folderPath: "ideas" });
    expect(commands.saveNote).toHaveBeenCalledWith("n1", {
      content: "text",
      baseHash: "h1",
      force: true,
    });
    expect(commands.renameNote).toHaveBeenCalledWith("n1", "New");
    expect(commands.moveNote).toHaveBeenCalledWith("n1", null);
    expect(commands.deleteNote).toHaveBeenCalledWith("n1");
  });

  it("rejects with the backend error payload", async () => {
    const payload = { code: "CONFLICT", message: "changed outside" };
    commands.saveNote.mockResolvedValue({ status: "error", error: payload });

    await expect(saveNote("n1", { content: "", baseHash: "h" })).rejects.toBe(payload);
  });
});
