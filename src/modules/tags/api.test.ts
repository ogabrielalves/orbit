import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Tag } from "@/bindings";
import { assignTag, createTag, fetchTags, fetchTaskTags, unassignTag } from "@/modules/tags/api";

const commands = vi.hoisted(() => ({
  listTags: vi.fn(),
  listTaskTags: vi.fn(),
  createTag: vi.fn(),
  assignTag: vi.fn(),
  unassignTag: vi.fn(),
}));

vi.mock("@/bindings", () => ({ commands }));

const tag: Tag = {
  id: "g1",
  name: "Bug",
  color: "ember",
  createdAt: "2026-11-08T10:00:00Z",
  updatedAt: "2026-11-08T10:00:00Z",
  taskCount: 2,
};

describe("tags api", () => {
  beforeEach(() => {
    for (const command of Object.values(commands)) {
      command.mockReset();
      command.mockResolvedValue({ status: "ok", data: tag });
    }
  });

  it("lists every tag", async () => {
    commands.listTags.mockResolvedValue({ status: "ok", data: [tag] });

    await expect(fetchTags()).resolves.toEqual([tag]);

    expect(commands.listTags).toHaveBeenCalledTimes(1);
  });

  it("lists the tags of a task", async () => {
    commands.listTaskTags.mockResolvedValue({ status: "ok", data: [tag] });

    await expect(fetchTaskTags("t1")).resolves.toEqual([tag]);

    expect(commands.listTaskTags).toHaveBeenCalledWith("t1");
  });

  it("creates a tag with a color", async () => {
    await expect(createTag({ name: "Bug", color: "ember" })).resolves.toEqual(tag);

    expect(commands.createTag).toHaveBeenCalledWith({ name: "Bug", color: "ember" });
  });

  it("assigns and unassigns a tag", async () => {
    commands.assignTag.mockResolvedValue({ status: "ok", data: null });
    commands.unassignTag.mockResolvedValue({ status: "ok", data: null });

    await expect(assignTag("t1", "g1")).resolves.toBeNull();
    await expect(unassignTag("t1", "g1")).resolves.toBeNull();

    expect(commands.assignTag).toHaveBeenCalledWith("t1", "g1");
    expect(commands.unassignTag).toHaveBeenCalledWith("t1", "g1");
  });

  it("rejects with the backend error payload", async () => {
    const payload = { code: "CONFLICT", message: "a tag named 'Bug' already exists" };
    commands.createTag.mockResolvedValue({ status: "error", error: payload });

    await expect(createTag({ name: "Bug" })).rejects.toBe(payload);
  });
});
