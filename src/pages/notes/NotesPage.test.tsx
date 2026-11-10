import { open } from "@tauri-apps/plugin-dialog";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { commands } from "@/bindings";
import { i18next } from "@/i18n";
import { renderApp } from "@/test/renderApp";

const getVaultStatus = vi.mocked(commands.getVaultStatus);
const setupVault = vi.mocked(commands.setupVault);
const updateSettings = vi.mocked(commands.updateSettings);
const pickFolder = vi.mocked(open);

describe("NotesPage vault onboarding", () => {
  beforeEach(async () => {
    await i18next.changeLanguage("en");
    getVaultStatus.mockReset();
    setupVault.mockReset();
    updateSettings.mockReset();
    pickFolder.mockReset();
    getVaultStatus.mockResolvedValue({ status: "ok", data: { path: null, isAccessible: false } });
  });

  it("asks the user to choose a folder when there is no vault", async () => {
    renderApp("/notes");

    expect(await screen.findByText("Choose where your notes live")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Choose a folder" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create a new vault" })).toBeInTheDocument();
  });

  it("sets up an existing folder without creating it", async () => {
    pickFolder.mockResolvedValue("C:\\notes");
    setupVault.mockResolvedValue({
      status: "ok",
      data: { path: "C:\\notes", wasCreated: false, noteCount: 3 },
    });
    renderApp("/notes");

    await userEvent.click(await screen.findByRole("button", { name: "Choose a folder" }));

    await waitFor(() =>
      expect(setupVault).toHaveBeenCalledWith({ path: "C:\\notes", create: false }),
    );
    expect(pickFolder).toHaveBeenCalledWith(expect.objectContaining({ directory: true }));
    expect(await screen.findByText("Vault ready · 3 notes found")).toBeInTheDocument();
    expect(updateSettings).not.toHaveBeenCalled();
  });

  it("creates a new vault when asked to", async () => {
    pickFolder.mockResolvedValue("C:\\new-vault");
    setupVault.mockResolvedValue({
      status: "ok",
      data: { path: "C:\\new-vault", wasCreated: true, noteCount: 0 },
    });
    renderApp("/notes");

    await userEvent.click(await screen.findByRole("button", { name: "Create a new vault" }));

    await waitFor(() =>
      expect(setupVault).toHaveBeenCalledWith({ path: "C:\\new-vault", create: true }),
    );
  });

  it("does nothing when the folder dialog is cancelled", async () => {
    pickFolder.mockResolvedValue(null);
    renderApp("/notes");

    await userEvent.click(await screen.findByRole("button", { name: "Choose a folder" }));

    expect(pickFolder).toHaveBeenCalled();
    expect(setupVault).not.toHaveBeenCalled();
  });

  it("shows the translated error when the folder is refused", async () => {
    pickFolder.mockResolvedValue("C:\\bad");
    setupVault.mockResolvedValue({
      status: "error",
      error: { code: "VALIDATION", message: "not writable" },
    });
    renderApp("/notes");

    await userEvent.click(await screen.findByRole("button", { name: "Choose a folder" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The information provided is not valid.",
    );
  });

  it("explains when the configured folder is no longer available", async () => {
    getVaultStatus.mockResolvedValue({
      status: "ok",
      data: { path: "D:\\gone", isAccessible: false },
    });
    renderApp("/notes");

    expect(await screen.findByText("Your notes folder is not available")).toBeInTheDocument();
    expect(screen.getByText("D:\\gone")).toBeInTheDocument();
  });

  it("does not ask for a folder when the vault is ready", async () => {
    getVaultStatus.mockResolvedValue({
      status: "ok",
      data: { path: "C:\\notes", isAccessible: true },
    });
    renderApp("/notes");

    await screen.findByRole("heading", { level: 1, name: "Notes" });
    await waitFor(() => expect(getVaultStatus).toHaveBeenCalled());

    expect(screen.queryByText("Choose where your notes live")).not.toBeInTheDocument();
  });

  it("shows the error with a retry when the status cannot be read", async () => {
    getVaultStatus.mockResolvedValueOnce({
      status: "error",
      error: { code: "DATABASE", message: "x" },
    });
    renderApp("/notes");

    expect(await screen.findByText("Could not check the notes folder")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByText("Choose where your notes live")).toBeInTheDocument();
  });
});
