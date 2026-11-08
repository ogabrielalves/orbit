import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { i18next } from "@/i18n";
import { useSyncLanguage } from "@/modules/settings/useSyncLanguage";

const { getSettings } = vi.hoisted(() => ({ getSettings: vi.fn() }));

vi.mock("@/bindings", () => ({ commands: { getSettings, updateSettings: vi.fn() } }));

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe("useSyncLanguage", () => {
  beforeEach(async () => {
    getSettings.mockReset();
    await i18next.changeLanguage("en");
  });

  it("applies the language saved in the settings", async () => {
    getSettings.mockResolvedValue({
      status: "ok",
      data: { language: "pt-BR", vaultPath: null },
    });

    renderHook(() => useSyncLanguage(), { wrapper });

    await waitFor(() => expect(i18next.language).toBe("pt-BR"));
  });

  it("keeps the current language while settings are not loaded", () => {
    getSettings.mockReturnValue(new Promise(() => undefined));

    renderHook(() => useSyncLanguage(), { wrapper });

    expect(i18next.language).toBe("en");
  });

  it("keeps the current language when loading fails", async () => {
    getSettings.mockResolvedValue({ status: "error", error: { code: "IO", message: "x" } });

    renderHook(() => useSyncLanguage(), { wrapper });
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(i18next.language).toBe("en");
  });
});
