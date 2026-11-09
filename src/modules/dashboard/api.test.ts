import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DashboardSummary } from "@/bindings";
import { fetchDashboardSummary } from "@/modules/dashboard/api";

const commands = vi.hoisted(() => ({ getDashboardSummary: vi.fn() }));

vi.mock("@/bindings", () => ({ commands }));

const summary: DashboardSummary = {
  tasks: { total: 0, backlog: 0, pending: 0, inProgress: 0, completed: 0 },
  activeProjectCount: 0,
  overdueTaskCount: 0,
  upcomingTasks: [],
};

describe("dashboard api", () => {
  beforeEach(() => {
    commands.getDashboardSummary.mockReset();
  });

  it("returns the summary and forwards the input", async () => {
    commands.getDashboardSummary.mockResolvedValue({ status: "ok", data: summary });

    await expect(fetchDashboardSummary({ today: "2026-11-08" })).resolves.toEqual(summary);

    expect(commands.getDashboardSummary).toHaveBeenCalledWith({ today: "2026-11-08" });
  });

  it("rejects with the backend error payload", async () => {
    const payload = { code: "DATABASE", message: "a database operation failed" };
    commands.getDashboardSummary.mockResolvedValue({ status: "error", error: payload });

    await expect(fetchDashboardSummary({})).rejects.toBe(payload);
  });
});
