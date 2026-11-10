import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { noteLinksKeys, useNoteLinks } from "@/modules/notes/linksQueries";

const commands = vi.hoisted(() => ({ getNoteLinks: vi.fn() }));

vi.mock("@/bindings", () => ({ commands }));

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { wrapper };
}

describe("note links queries", () => {
  beforeEach(() => {
    commands.getNoteLinks.mockReset();
  });

  it("scopes the key under notes so note invalidation refreshes it", () => {
    expect(noteLinksKeys.detail("n1")).toEqual(["notes", "links", "n1"]);
  });

  it("loads the links of a note", async () => {
    commands.getNoteLinks.mockResolvedValue({
      status: "ok",
      data: { outgoing: [], backlinks: [] },
    });
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useNoteLinks("n1"), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ outgoing: [], backlinks: [] });
  });

  it("does not fetch while disabled", () => {
    const { wrapper } = createWrapper();

    renderHook(() => useNoteLinks("n1", false), { wrapper });

    expect(commands.getNoteLinks).not.toHaveBeenCalled();
  });
});
