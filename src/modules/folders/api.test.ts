import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createFolder,
  deleteFolder,
  fetchFolders,
  moveFolder,
  renameFolder,
} from "@/modules/folders/api";

const commands = vi.hoisted(() => ({
  listFolders: vi.fn(),
  createFolder: vi.fn(),
  renameFolder: vi.fn(),
  moveFolder: vi.fn(),
  deleteFolder: vi.fn(),
}));

vi.mock("@/bindings", () => ({ commands }));

describe("folders api", () => {
  beforeEach(() => {
    for (const command of Object.values(commands)) {
      command.mockReset();
      command.mockResolvedValue({ status: "ok", data: "result" });
    }
  });

  it("lists the folders", async () => {
    await expect(fetchFolders()).resolves.toBe("result");
  });

  it("creates, renames and moves folders", async () => {
    await createFolder({ parentPath: "ideas", name: "Work" });
    await renameFolder("ideas/Work", "Job");
    await moveFolder("ideas/Job", null);

    expect(commands.createFolder).toHaveBeenCalledWith({ parentPath: "ideas", name: "Work" });
    expect(commands.renameFolder).toHaveBeenCalledWith("ideas/Work", "Job");
    expect(commands.moveFolder).toHaveBeenCalledWith("ideas/Job", null);
  });

  it("passes the recursive flag when deleting", async () => {
    await deleteFolder("ideas", true);

    expect(commands.deleteFolder).toHaveBeenCalledWith("ideas", true);
  });

  it("rejects with the backend error payload", async () => {
    const payload = { code: "VALIDATION", message: "folder is not empty" };
    commands.deleteFolder.mockResolvedValue({ status: "error", error: payload });

    await expect(deleteFolder("ideas", false)).rejects.toBe(payload);
  });
});
