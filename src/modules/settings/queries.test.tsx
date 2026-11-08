import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Settings } from "@/bindings";
import { settingsKeys, useSettings, useUpdateSettings } from "@/modules/settings/queries";

const { getSettings, updateSettings } = vi.hoisted(() => ({
  getSettings: vi.fn(),
  updateSettings: vi.fn(),
}));

vi.mock("@/bindings", () => ({ commands: { getSettings, updateSettings } }));

const settings: Settings = { language: "pt-BR", vaultPath: null };

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, wrapper };
}

describe("settings queries", () => {
  beforeEach(() => {
    getSettings.mockReset();
    updateSettings.mockReset();
  });

  it("loads the settings", async () => {
    getSettings.mockResolvedValue({ status: "ok", data: settings });
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useSettings(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(settings);
  });

  it("loads settings that follow the system language", async () => {
    getSettings.mockResolvedValue({ status: "ok", data: { language: null, vaultPath: null } });
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useSettings(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.language).toBeNull();
  });

  it("exposes the backend error when loading fails", async () => {
    const payload = { code: "IO", message: "a file operation failed" };
    getSettings.mockResolvedValue({ status: "error", error: payload });
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useSettings(), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBe(payload);
  });

  it("writes the saved settings into the cache after an update", async () => {
    const saved: Settings = { ...settings, language: "en" };
    updateSettings.mockResolvedValue({ status: "ok", data: saved });
    const { queryClient, wrapper } = createWrapper();

    const { result } = renderHook(() => useUpdateSettings(), { wrapper });
    result.current.mutate({ language: "en" });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(queryClient.getQueryData(settingsKeys.all)).toEqual(saved);
  });
});
