import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { commands } from "@/bindings";
import { i18next } from "@/i18n";
import { SettingsPage } from "@/pages/settings/SettingsPage";
import { renderWithRouter } from "@/test/renderWithRouter";

const getSettings = vi.mocked(commands.getSettings);

describe("settings page loading and failure", () => {
  beforeEach(async () => {
    await i18next.changeLanguage("en");
    getSettings.mockReset();
  });

  it("shows a loading state while the settings load", async () => {
    getSettings.mockReturnValue(new Promise(() => undefined));
    renderWithRouter(<SettingsPage />, "/settings");

    expect(await screen.findByRole("status")).toHaveTextContent("Loading…");
    expect(screen.getByRole("heading", { level: 1, name: "Settings" })).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("explains the failure and offers a retry that loads the page", async () => {
    getSettings.mockResolvedValue({ status: "error", error: { code: "DATABASE", message: "x" } });
    renderWithRouter(<SettingsPage />, "/settings");

    expect(await screen.findByText("Could not load the settings")).toBeInTheDocument();
    expect(screen.getByText("Could not access the application data.")).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();

    getSettings.mockResolvedValue({
      status: "ok",
      data: { language: null, vaultPath: "C:\\ORBIT", userName: "Ana" },
    });
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByRole("combobox", { name: "App language" })).toBeInTheDocument();
    expect(screen.queryByText("Could not load the settings")).not.toBeInTheDocument();
  });
});
