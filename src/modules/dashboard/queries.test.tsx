import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DashboardSummary } from "@/bindings";
import { dashboardKeys, useDashboardSummary } from "@/modules/dashboard/queries";

const commands = vi.hoisted(() => ({ getDashboardSummary: vi.fn() }));

vi.mock("@/bindings", () => ({ commands }));

const summary: DashboardSummary = {
  tasks: { total: 3, backlog: 1, pending: 1, inProgress: 1, completed: 0 },
  activeProjectCount: 2,
  overdueTaskCount: 1,
  upcomingTasks: [],
};

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { wrapper };
}

describe("useDashboardSummary", () => {
  beforeEach(() => {
    commands.getDashboardSummary.mockReset();
  });

  it("loads the summary for the given day", async () => {
    commands.getDashboardSummary.mockResolvedValue({ status: "ok", data: summary });
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useDashboardSummary({ today: "2026-11-08" }), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(summary);
    expect(commands.getDashboardSummary).toHaveBeenCalledWith({ today: "2026-11-08" });
  });

  it("exposes the backend error", async () => {
    const payload = { code: "INTERNAL", message: "x" };
    commands.getDashboardSummary.mockResolvedValue({ status: "error", error: payload });
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useDashboardSummary({ today: "2026-11-08" }), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBe(payload);
  });

  it("keeps a separate cache entry per day", () => {
    expect(dashboardKeys.summary({ today: "2026-11-08" })).not.toEqual(
      dashboardKeys.summary({ today: "2026-11-09" }),
    );
  });
});
