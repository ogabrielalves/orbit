import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { searchKeys, useSearchResults } from "@/modules/search/queries";

const commands = vi.hoisted(() => ({ search: vi.fn() }));

vi.mock("@/bindings", () => ({ commands }));

const empty = { projects: [], boards: [], tasks: [], notes: [], folders: [] };

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe("search queries", () => {
  beforeEach(() => {
    commands.search.mockReset();
    commands.search.mockResolvedValue({ status: "ok", data: empty });
  });

  it("searches with the trimmed query", async () => {
    const { result } = renderHook(() => useSearchResults("  plan  "), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(commands.search).toHaveBeenCalledWith({ query: "plan" });
    expect(searchKeys.query({ query: "plan" })).toEqual(["search", "query", { query: "plan" }]);
  });

  it("does not search a blank query", () => {
    const { result } = renderHook(() => useSearchResults("   "), { wrapper });

    expect(result.current.fetchStatus).toBe("idle");
    expect(commands.search).not.toHaveBeenCalled();
  });

  it("does not search while disabled", () => {
    const { result } = renderHook(() => useSearchResults("plan", false), { wrapper });

    expect(result.current.fetchStatus).toBe("idle");
    expect(commands.search).not.toHaveBeenCalled();
  });
});
