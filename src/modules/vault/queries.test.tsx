import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { folderKeys } from "@/modules/folders/queries";
import { noteLinksKeys } from "@/modules/notes/linksQueries";
import { noteKeys, vaultKeys } from "@/modules/notes/queries";
import { useReindexVault } from "@/modules/vault/queries";

const { reindexVault } = vi.hoisted(() => ({ reindexVault: vi.fn() }));

vi.mock("@/bindings", () => ({ commands: { reindexVault } }));

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, wrapper };
}

const report = { added: 1, updated: 0, unchanged: 2, removed: 0, idsAssigned: 0, skipped: [] };

describe("reindex vault mutation", () => {
  beforeEach(() => {
    reindexVault.mockReset();
  });

  it("returns the index report and refreshes the notes, folders, links and vault status", async () => {
    reindexVault.mockResolvedValue({ status: "ok", data: report });
    const { queryClient, wrapper } = createWrapper();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useReindexVault(), { wrapper });
    result.current.mutate();

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(report);
    const invalidatedKeys = invalidate.mock.calls.map(([filters]) => filters?.queryKey);
    expect(invalidatedKeys).toEqual(
      expect.arrayContaining([vaultKeys.status, noteKeys.all, noteLinksKeys.all, folderKeys.all]),
    );
  });

  it("exposes the backend error and refreshes nothing when it fails", async () => {
    const payload = { code: "NOT_FOUND", message: "vault" };
    reindexVault.mockResolvedValue({ status: "error", error: payload });
    const { queryClient, wrapper } = createWrapper();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useReindexVault(), { wrapper });
    result.current.mutate();

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBe(payload);
    expect(invalidate).not.toHaveBeenCalled();
  });
});
