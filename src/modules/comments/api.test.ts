import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Comment } from "@/bindings";
import { createComment, deleteComment, fetchComments, updateComment } from "@/modules/comments/api";

const commands = vi.hoisted(() => ({
  listComments: vi.fn(),
  createComment: vi.fn(),
  updateComment: vi.fn(),
  deleteComment: vi.fn(),
}));

vi.mock("@/bindings", () => ({ commands }));

const comment: Comment = {
  id: "m1",
  taskId: "t1",
  body: "Looks good",
  createdAt: "2026-11-08T10:00:00Z",
  updatedAt: "2026-11-08T10:00:00Z",
};

describe("comments api", () => {
  beforeEach(() => {
    for (const command of Object.values(commands)) {
      command.mockReset();
      command.mockResolvedValue({ status: "ok", data: comment });
    }
  });

  it("lists the comments of a task", async () => {
    commands.listComments.mockResolvedValue({ status: "ok", data: [comment] });

    await expect(fetchComments("t1")).resolves.toEqual([comment]);

    expect(commands.listComments).toHaveBeenCalledWith("t1");
  });

  it("creates a comment", async () => {
    await expect(createComment({ taskId: "t1", body: "Looks good" })).resolves.toEqual(comment);

    expect(commands.createComment).toHaveBeenCalledWith({ taskId: "t1", body: "Looks good" });
  });

  it("edits the body of a comment", async () => {
    await updateComment("m1", "Looks great");

    expect(commands.updateComment).toHaveBeenCalledWith("m1", "Looks great");
  });

  it("deletes a comment", async () => {
    commands.deleteComment.mockResolvedValue({ status: "ok", data: null });

    await expect(deleteComment("m1")).resolves.toBeNull();

    expect(commands.deleteComment).toHaveBeenCalledWith("m1");
  });

  it("rejects with the backend error payload", async () => {
    const payload = { code: "VALIDATION", message: "comment cannot be empty" };
    commands.createComment.mockResolvedValue({ status: "error", error: payload });

    await expect(createComment({ taskId: "t1", body: "" })).rejects.toBe(payload);
  });
});
