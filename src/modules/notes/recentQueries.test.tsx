import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RecentNote } from "@/bindings";
import { noteKeys } from "@/modules/notes/queries";
import { recentNotesKeys, useRecentNotes } from "@/modules/notes/recentQueries";

const { listRecentNotes } = vi.hoisted(() => ({ listRecentNotes: vi.fn() }));

vi.mock("@/bindings", () => ({ commands: { listRecentNotes } }));

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, wrapper };
}

const note: RecentNote = {
  id: "n1",
  title: "A",
  path: "A.md",
  folder: null,
  excerpt: "x",
  createdAt: "2026-11-08T10:00:00Z",
  modifiedAt: "2026-11-08T12:00:00Z",
};

describe("recent notes query", () => {
  beforeEach(() => {
    listRecentNotes.mockReset();
  });

  it("loads the recent notes with the limit", async () => {
    listRecentNotes.mockResolvedValue({ status: "ok", data: [note] });
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useRecentNotes(5), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(listRecentNotes).toHaveBeenCalledWith({ limit: 5 });
    expect(result.current.data).toEqual([note]);
  });

  it("passes a null limit through", async () => {
    listRecentNotes.mockResolvedValue({ status: "ok", data: [] });
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useRecentNotes(null), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(listRecentNotes).toHaveBeenCalledWith({ limit: null });
  });

  it("exposes the backend error when loading fails", async () => {
    const payload = { code: "NOT_FOUND", message: "vault" };
    listRecentNotes.mockResolvedValue({ status: "error", error: payload });
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useRecentNotes(5), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBe(payload);
  });

  it("is refreshed when the notes are invalidated", async () => {
    listRecentNotes.mockResolvedValue({ status: "ok", data: [note] });
    const { queryClient, wrapper } = createWrapper();
    const { result } = renderHook(() => useRecentNotes(5), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    await queryClient.invalidateQueries({ queryKey: noteKeys.all });

    await waitFor(() => expect(listRecentNotes).toHaveBeenCalledTimes(2));
  });

  it("keeps a different cache entry per limit", () => {
    expect(recentNotesKeys.list(5)).not.toEqual(recentNotesKeys.list(10));
  });
});
