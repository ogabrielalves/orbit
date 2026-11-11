import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Language, Settings } from "@/bindings";
import { i18next } from "@/i18n";
import { settingsKeys } from "@/modules/settings/queries";
import { useSyncLanguage } from "@/modules/settings/useSyncLanguage";

const { getSettings } = vi.hoisted(() => ({ getSettings: vi.fn() }));

vi.mock("@/bindings", () => ({ commands: { getSettings, updateSettings: vi.fn() } }));

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, wrapper };
}

function mockSavedLanguage(language: Language | null) {
  const settings: Settings = { language, vaultPath: null, userName: null };
  getSettings.mockResolvedValue({ status: "ok", data: settings });
}

function mockSystemLanguage(languageTag: string) {
  vi.spyOn(navigator, "language", "get").mockReturnValue(languageTag);
}

describe("useSyncLanguage", () => {
  beforeEach(async () => {
    getSettings.mockReset();
    await i18next.changeLanguage("en");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("applies the language saved in the settings", async () => {
    mockSavedLanguage("pt-BR");
    mockSystemLanguage("en-US");
    const { wrapper } = createWrapper();

    renderHook(() => useSyncLanguage(), { wrapper });

    await waitFor(() => expect(i18next.language).toBe("pt-BR"));
  });

  it("prefers the saved language over the system language", async () => {
    mockSavedLanguage("en");
    mockSystemLanguage("pt-BR");
    await i18next.changeLanguage("pt-BR");
    const { wrapper } = createWrapper();

    renderHook(() => useSyncLanguage(), { wrapper });

    await waitFor(() => expect(i18next.language).toBe("en"));
  });

  it("follows a Portuguese system when no language is saved", async () => {
    mockSavedLanguage(null);
    mockSystemLanguage("pt-BR");
    const { wrapper } = createWrapper();

    renderHook(() => useSyncLanguage(), { wrapper });

    await waitFor(() => expect(i18next.language).toBe("pt-BR"));
  });

  it("follows an English system when no language is saved", async () => {
    mockSavedLanguage(null);
    mockSystemLanguage("en-US");
    await i18next.changeLanguage("pt-BR");
    const { wrapper } = createWrapper();

    renderHook(() => useSyncLanguage(), { wrapper });

    await waitFor(() => expect(i18next.language).toBe("en"));
  });

  it("falls back to English for an unsupported system language", async () => {
    mockSavedLanguage(null);
    mockSystemLanguage("fr-FR");
    await i18next.changeLanguage("pt-BR");
    const { wrapper } = createWrapper();

    renderHook(() => useSyncLanguage(), { wrapper });

    await waitFor(() => expect(i18next.language).toBe("en"));
  });

  it("returns to the system language when the saved language is cleared", async () => {
    mockSavedLanguage("pt-BR");
    mockSystemLanguage("en-US");
    const { queryClient, wrapper } = createWrapper();
    renderHook(() => useSyncLanguage(), { wrapper });
    await waitFor(() => expect(i18next.language).toBe("pt-BR"));

    queryClient.setQueryData<Settings>(settingsKeys.all, {
      language: null,
      vaultPath: null,
      userName: null,
    });

    await waitFor(() => expect(i18next.language).toBe("en"));
  });

  it("keeps the current language while settings are not loaded", () => {
    getSettings.mockReturnValue(new Promise(() => undefined));
    mockSystemLanguage("pt-BR");
    const { wrapper } = createWrapper();

    renderHook(() => useSyncLanguage(), { wrapper });

    expect(i18next.language).toBe("en");
  });

  it("keeps the current language when loading fails", async () => {
    getSettings.mockResolvedValue({ status: "error", error: { code: "IO", message: "x" } });
    mockSystemLanguage("pt-BR");
    const { wrapper } = createWrapper();

    renderHook(() => useSyncLanguage(), { wrapper });
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(i18next.language).toBe("en");
  });
});
