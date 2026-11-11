import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DatabaseStatus } from "@/bindings";
import { useDatabaseStatus } from "@/modules/integrity/queries";

const { getDatabaseStatus } = vi.hoisted(() => ({ getDatabaseStatus: vi.fn() }));

vi.mock("@/bindings", () => ({ commands: { getDatabaseStatus } }));

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

const healthy: DatabaseStatus = {
  state: "healthy",
  integrityIssues: [],
  foreignKeyViolations: 0,
  checkedAt: "2026-11-11T10:00:00.000Z",
};

describe("database status query", () => {
  beforeEach(() => {
    getDatabaseStatus.mockReset();
  });

  it("loads the status", async () => {
    getDatabaseStatus.mockResolvedValue({ status: "ok", data: healthy });

    const { result } = renderHook(() => useDatabaseStatus(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(healthy);
  });

  it("exposes the backend error when loading fails", async () => {
    const payload = { code: "DATABASE", message: "x" };
    getDatabaseStatus.mockResolvedValue({ status: "error", error: payload });

    const { result } = renderHook(() => useDatabaseStatus(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBe(payload);
  });

  it("asks again while the check is still pending", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      getDatabaseStatus
        .mockResolvedValueOnce({
          status: "ok",
          data: { ...healthy, state: "pending", checkedAt: null },
        })
        .mockResolvedValue({ status: "ok", data: healthy });

      const { result } = renderHook(() => useDatabaseStatus(), { wrapper: createWrapper() });
      await waitFor(() => expect(result.current.data?.state).toBe("pending"));
      await vi.advanceTimersByTimeAsync(2100);

      await waitFor(() => expect(result.current.data?.state).toBe("healthy"));
      expect(getDatabaseStatus).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not poll once the check is done", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      getDatabaseStatus.mockResolvedValue({ status: "ok", data: healthy });

      const { result } = renderHook(() => useDatabaseStatus(), { wrapper: createWrapper() });
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      await vi.advanceTimersByTimeAsync(6000);

      expect(getDatabaseStatus).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
