import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ActivityEntry } from "@/bindings";
import { activityKeys, useRecentActivity } from "@/modules/activity/queries";

const commands = vi.hoisted(() => ({ listRecentActivity: vi.fn() }));

vi.mock("@/bindings", () => ({ commands }));

const entry: ActivityEntry = {
  id: "a1",
  entityType: "project",
  entityId: "p1",
  action: "created",
  changes: null,
  createdAt: "2026-11-08T10:00:00Z",
};

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, wrapper };
}

describe("useRecentActivity", () => {
  beforeEach(() => {
    commands.listRecentActivity.mockReset();
  });

  it("loads the recent entries", async () => {
    commands.listRecentActivity.mockResolvedValue({ status: "ok", data: [entry] });
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useRecentActivity(10), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([entry]);
    expect(commands.listRecentActivity).toHaveBeenCalledWith(10);
  });

  it("exposes the backend error", async () => {
    const payload = { code: "INTERNAL", message: "x" };
    commands.listRecentActivity.mockResolvedValue({ status: "error", error: payload });
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useRecentActivity(10), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBe(payload);
  });

  it("refetches when it is shown again instead of trusting a cached feed", async () => {
    commands.listRecentActivity.mockResolvedValue({ status: "ok", data: [entry] });
    const { wrapper } = createWrapper();
    const first = renderHook(() => useRecentActivity(10), { wrapper });
    await waitFor(() => expect(first.result.current.isSuccess).toBe(true));
    first.unmount();

    const second = renderHook(() => useRecentActivity(10), { wrapper });
    await waitFor(() => expect(commands.listRecentActivity).toHaveBeenCalledTimes(2));

    expect(second.result.current.data).toEqual([entry]);
  });

  it("keeps a separate cache entry per limit", () => {
    expect(activityKeys.recent(10)).not.toEqual(activityKeys.recent(20));
    expect(activityKeys.recent(null)).not.toEqual(activityKeys.recent(10));
  });
});
