import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useVaultEvents } from "@/modules/notes/useVaultEvents";

const vault = vi.hoisted(() => ({
  listen: vi.fn(),
  unlisten: vi.fn(),
}));

vi.mock("@/bindings", () => ({
  events: { vaultChanged: { listen: vault.listen } },
}));

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>;
}

describe("useVaultEvents lifecycle", () => {
  beforeEach(() => {
    vault.listen.mockReset();
    vault.unlisten.mockReset();
  });

  it("releases the listener that resolves after the hook was unmounted", async () => {
    let resolveListen: (stop: () => void) => void = () => undefined;
    vault.listen.mockReturnValue(
      new Promise<() => void>((resolve) => {
        resolveListen = resolve;
      }),
    );
    const { unmount } = renderHook(() => useVaultEvents(), { wrapper });

    unmount();
    resolveListen(vault.unlisten);
    await Promise.resolve();
    await Promise.resolve();

    expect(vault.unlisten).toHaveBeenCalledTimes(1);
  });

  it("does not crash when the listener cannot be registered", async () => {
    vault.listen.mockReturnValue(Promise.reject(new Error("not running inside Tauri")));

    const { unmount } = renderHook(() => useVaultEvents(), { wrapper });
    await Promise.resolve();
    await Promise.resolve();

    expect(() => unmount()).not.toThrow();
    expect(vault.unlisten).not.toHaveBeenCalled();
  });
});
