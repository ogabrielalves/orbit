import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Settings } from "@/bindings";
import { fetchSettings, saveSettings } from "@/modules/settings/api";

const { getSettings, updateSettings } = vi.hoisted(() => ({
  getSettings: vi.fn(),
  updateSettings: vi.fn(),
}));

vi.mock("@/bindings", () => ({ commands: { getSettings, updateSettings } }));

const settings: Settings = { language: "pt-BR", vaultPath: null, userName: null };

describe("settings api", () => {
  beforeEach(() => {
    getSettings.mockReset();
    updateSettings.mockReset();
  });

  it("returns the settings from a successful get", async () => {
    getSettings.mockResolvedValue({ status: "ok", data: settings });

    await expect(fetchSettings()).resolves.toEqual(settings);
  });

  it("rejects with the backend error payload when get fails", async () => {
    const payload = { code: "DATABASE", message: "a database operation failed" };
    getSettings.mockResolvedValue({ status: "error", error: payload });

    await expect(fetchSettings()).rejects.toBe(payload);
  });

  it("sends a partial update and returns the saved settings", async () => {
    updateSettings.mockResolvedValue({ status: "ok", data: { ...settings, language: "en" } });

    const saved = await saveSettings({ language: "en" });

    expect(updateSettings).toHaveBeenCalledWith({ language: "en" });
    expect(saved.language).toBe("en");
  });

  it("returns a null language when the system language is followed", async () => {
    getSettings.mockResolvedValue({
      status: "ok",
      data: { language: null, vaultPath: null, userName: null },
    });

    const loaded = await fetchSettings();

    expect(loaded.language).toBeNull();
  });

  it("sends a null language to clear the saved one", async () => {
    updateSettings.mockResolvedValue({
      status: "ok",
      data: { language: null, vaultPath: null, userName: null },
    });

    const saved = await saveSettings({ language: null });

    expect(updateSettings).toHaveBeenCalledWith({ language: null });
    expect(saved.language).toBeNull();
  });

  it("does not send a language when only the vault path changes", async () => {
    updateSettings.mockResolvedValue({ status: "ok", data: { ...settings, vaultPath: "/vault" } });

    await saveSettings({ vaultPath: "/vault" });

    expect(updateSettings).toHaveBeenCalledWith({ vaultPath: "/vault" });
  });

  it("rejects with the backend error payload when update fails", async () => {
    const payload = { code: "VALIDATION", message: "invalid vault path" };
    updateSettings.mockResolvedValue({ status: "error", error: payload });

    await expect(saveSettings({ vaultPath: "" })).rejects.toBe(payload);
  });
});
