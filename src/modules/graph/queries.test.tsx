import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { graphKeys, useGraph, useLocalGraph } from "@/modules/graph/queries";

const commands = vi.hoisted(() => ({ getGraph: vi.fn(), getLocalGraph: vi.fn() }));

vi.mock("@/bindings", () => ({ commands }));

const graph = { nodes: [], edges: [] };

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe("graph queries", () => {
  beforeEach(() => {
    for (const command of Object.values(commands)) {
      command.mockReset();
      command.mockResolvedValue({ status: "ok", data: graph });
    }
  });

  it("reads the whole graph with the unresolved flag", async () => {
    const { result } = renderHook(() => useGraph(true), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(commands.getGraph).toHaveBeenCalledWith({ includeUnresolved: true });
  });

  it("reads the local graph with note, depth and flag", async () => {
    const { result } = renderHook(() => useLocalGraph("n1", 2, false), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(commands.getLocalGraph).toHaveBeenCalledWith({
      noteId: "n1",
      depth: 2,
      includeUnresolved: false,
    });
  });

  it("lives under the notes keys so note changes refresh it", () => {
    expect(graphKeys.full({ includeUnresolved: false }).slice(0, 1)).toEqual(["notes"]);
    expect(graphKeys.local({ noteId: "n1" }).slice(0, 1)).toEqual(["notes"]);
  });
});
