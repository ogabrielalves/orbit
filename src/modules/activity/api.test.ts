import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ActivityEntry } from "@/bindings";
import { fetchRecentActivity, fetchTaskHistory } from "@/modules/activity/api";

const commands = vi.hoisted(() => ({
  listRecentActivity: vi.fn(),
  getTaskHistory: vi.fn(),
}));

vi.mock("@/bindings", () => ({ commands }));

const entry: ActivityEntry = {
  id: "a1",
  entityType: "project",
  entityId: "p1",
  action: "created",
  changes: { name: { from: null, to: "ORBIT" } },
  createdAt: "2026-11-08T10:00:00Z",
};

describe("activity api", () => {
  beforeEach(() => {
    commands.listRecentActivity.mockReset();
  });

  it("returns the recent entries", async () => {
    commands.listRecentActivity.mockResolvedValue({ status: "ok", data: [entry] });

    await expect(fetchRecentActivity(10)).resolves.toEqual([entry]);

    expect(commands.listRecentActivity).toHaveBeenCalledWith(10);
  });

  it("sends null to use the backend default limit", async () => {
    commands.listRecentActivity.mockResolvedValue({ status: "ok", data: [] });

    await fetchRecentActivity(null);

    expect(commands.listRecentActivity).toHaveBeenCalledWith(null);
  });

  it("rejects with the backend error payload", async () => {
    const payload = { code: "DATABASE", message: "a database operation failed" };
    commands.listRecentActivity.mockResolvedValue({ status: "error", error: payload });

    await expect(fetchRecentActivity(10)).rejects.toBe(payload);
  });
});

describe("task history api", () => {
  beforeEach(() => {
    commands.getTaskHistory.mockReset();
  });

  it("returns the entries of the task", async () => {
    commands.getTaskHistory.mockResolvedValue({ status: "ok", data: [entry] });

    await expect(fetchTaskHistory("t1", null)).resolves.toEqual([entry]);

    expect(commands.getTaskHistory).toHaveBeenCalledWith("t1", null);
  });

  it("rejects with the backend error payload", async () => {
    const payload = { code: "NOT_FOUND", message: "task not found" };
    commands.getTaskHistory.mockResolvedValue({ status: "error", error: payload });

    await expect(fetchTaskHistory("t1", 5)).rejects.toBe(payload);
  });
});
