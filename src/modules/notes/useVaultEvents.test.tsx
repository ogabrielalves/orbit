import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { folderKeys } from "@/modules/folders/queries";
import { noteKeys } from "@/modules/notes/queries";
import { useVaultEvents } from "@/modules/notes/useVaultEvents";

const vault = vi.hoisted(() => ({
  handler: null as null | (() => void),
  unlisten: vi.fn(),
}));

vi.mock("@/bindings", () => ({
  events: {
    vaultChanged: {
      listen: (handler: () => void) => {
        vault.handler = handler;
        return Promise.resolve(vault.unlisten);
      },
    },
  },
}));

function createWrapper() {
  const queryClient = new QueryClient();
  const invalidate = vi.spyOn(queryClient, "invalidateQueries");
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { invalidate, wrapper };
}

describe("useVaultEvents", () => {
  beforeEach(() => {
    vault.handler = null;
    vault.unlisten.mockReset();
  });

  it("refreshes the notes, the open note and the folders when the vault changes", async () => {
    const { invalidate, wrapper } = createWrapper();
    renderHook(() => useVaultEvents(), { wrapper });
    await waitFor(() => expect(vault.handler).not.toBeNull());

    vault.handler?.();

    expect(invalidate).toHaveBeenCalledWith({ queryKey: noteKeys.all });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: folderKeys.all });
    expect(noteKeys.detail("n1").slice(0, 1)).toEqual(noteKeys.all);
  });

  it("stops listening when unmounted", async () => {
    const { wrapper } = createWrapper();
    const { unmount } = renderHook(() => useVaultEvents(), { wrapper });
    await waitFor(() => expect(vault.handler).not.toBeNull());
    await Promise.resolve();

    unmount();

    expect(vault.unlisten).toHaveBeenCalledTimes(1);
  });
});
