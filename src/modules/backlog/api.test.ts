import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchBacklog, fetchBacklogByProject } from "@/modules/backlog/api";

const commands = vi.hoisted(() => ({ listBacklog: vi.fn(), listBacklogByProject: vi.fn() }));

vi.mock("@/bindings", () => ({ commands }));

describe("backlog api", () => {
  beforeEach(() => {
    commands.listBacklog.mockReset();
    commands.listBacklogByProject.mockReset();
  });

  it("returns the flat backlog for the given filters", async () => {
    commands.listBacklog.mockResolvedValue({ status: "ok", data: [] });

    await expect(fetchBacklog({ priority: "high", sort: "title" })).resolves.toEqual([]);

    expect(commands.listBacklog).toHaveBeenCalledWith({ priority: "high", sort: "title" });
  });

  it("returns the backlog grouped by project", async () => {
    const groups = [{ projectId: "p1", projectName: "ORBIT", items: [] }];
    commands.listBacklogByProject.mockResolvedValue({ status: "ok", data: groups });

    await expect(fetchBacklogByProject({})).resolves.toEqual(groups);
  });

  it("rejects with the backend error payload", async () => {
    const payload = { code: "DATABASE", message: "a database operation failed" };
    commands.listBacklog.mockResolvedValue({ status: "error", error: payload });

    await expect(fetchBacklog({})).rejects.toBe(payload);
  });
});
