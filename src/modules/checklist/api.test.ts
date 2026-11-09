import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChecklistItem } from "@/bindings";
import {
  createChecklistItem,
  deleteChecklistItem,
  fetchChecklist,
  moveChecklistItem,
  updateChecklistItem,
} from "@/modules/checklist/api";

const commands = vi.hoisted(() => ({
  listChecklistItems: vi.fn(),
  createChecklistItem: vi.fn(),
  updateChecklistItem: vi.fn(),
  moveChecklistItem: vi.fn(),
  deleteChecklistItem: vi.fn(),
}));

vi.mock("@/bindings", () => ({ commands }));

const item: ChecklistItem = {
  id: "i1",
  taskId: "t1",
  text: "Review",
  isDone: false,
  position: "a0",
  createdAt: "2026-11-08T10:00:00Z",
  updatedAt: "2026-11-08T10:00:00Z",
};

describe("checklist api", () => {
  beforeEach(() => {
    for (const command of Object.values(commands)) {
      command.mockReset();
      command.mockResolvedValue({ status: "ok", data: item });
    }
  });

  it("lists the items of a task", async () => {
    commands.listChecklistItems.mockResolvedValue({ status: "ok", data: [item] });

    await expect(fetchChecklist("t1")).resolves.toEqual([item]);

    expect(commands.listChecklistItems).toHaveBeenCalledWith("t1");
  });

  it("creates an item", async () => {
    await expect(createChecklistItem({ taskId: "t1", text: "Review" })).resolves.toEqual(item);

    expect(commands.createChecklistItem).toHaveBeenCalledWith({ taskId: "t1", text: "Review" });
  });

  it("updates the text or the state of an item", async () => {
    await updateChecklistItem("i1", { isDone: true });
    await updateChecklistItem("i1", { text: "Review twice" });

    expect(commands.updateChecklistItem).toHaveBeenNthCalledWith(1, "i1", { isDone: true });
    expect(commands.updateChecklistItem).toHaveBeenNthCalledWith(2, "i1", {
      text: "Review twice",
    });
  });

  it("moves an item after another one or to the top", async () => {
    await moveChecklistItem("i1", "i2");
    await moveChecklistItem("i1", null);

    expect(commands.moveChecklistItem).toHaveBeenNthCalledWith(1, "i1", "i2");
    expect(commands.moveChecklistItem).toHaveBeenNthCalledWith(2, "i1", null);
  });

  it("deletes an item", async () => {
    commands.deleteChecklistItem.mockResolvedValue({ status: "ok", data: null });

    await expect(deleteChecklistItem("i1")).resolves.toBeNull();

    expect(commands.deleteChecklistItem).toHaveBeenCalledWith("i1");
  });

  it("rejects with the backend error payload", async () => {
    const payload = { code: "VALIDATION", message: "too many items" };
    commands.createChecklistItem.mockResolvedValue({ status: "error", error: payload });

    await expect(createChecklistItem({ taskId: "t1", text: "x" })).rejects.toBe(payload);
  });
});
