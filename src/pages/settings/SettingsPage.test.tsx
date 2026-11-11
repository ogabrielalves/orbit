import { open, save } from "@tauri-apps/plugin-dialog";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { commands, type DatabaseStatus, type Settings } from "@/bindings";
import { i18next } from "@/i18n";
import { renderApp } from "@/test/renderApp";

const getSettings = vi.mocked(commands.getSettings);
const updateSettings = vi.mocked(commands.updateSettings);
const setupVault = vi.mocked(commands.setupVault);
const reindexVault = vi.mocked(commands.reindexVault);
const exportDatabase = vi.mocked(commands.exportDatabase);
const importDatabase = vi.mocked(commands.importDatabase);
const getDatabaseStatus = vi.mocked(commands.getDatabaseStatus);
const pickFile = vi.mocked(open);
const pickDestination = vi.mocked(save);

const baseSettings: Settings = { language: null, vaultPath: "C:\\ORBIT", userName: "Ana" };

const healthyStatus: DatabaseStatus = {
  state: "healthy",
  integrityIssues: [],
  foreignKeyViolations: 0,
  checkedAt: new Date().toISOString(),
};

const emptyIndexReport = {
  added: 0,
  updated: 0,
  unchanged: 0,
  removed: 0,
  idsAssigned: 0,
  skipped: [],
};

function mockSettings(settings: Partial<Settings> = {}) {
  getSettings.mockResolvedValue({ status: "ok", data: { ...baseSettings, ...settings } });
}

async function openSettings() {
  const router = renderApp("/settings");
  await screen.findByRole("heading", { level: 1, name: "Settings" });
  await screen.findByRole("combobox", { name: "App language" });
  return router;
}

describe("settings page", () => {
  beforeEach(async () => {
    await i18next.changeLanguage("en");
    for (const command of [
      getSettings,
      updateSettings,
      setupVault,
      reindexVault,
      exportDatabase,
      importDatabase,
      getDatabaseStatus,
      pickFile,
      pickDestination,
    ]) {
      command.mockReset();
    }
    mockSettings();
    getDatabaseStatus.mockResolvedValue({ status: "ok", data: healthyStatus });
    pickFile.mockResolvedValue(null);
    pickDestination.mockResolvedValue(null);
  });

  describe("language", () => {
    it("follows the system by default and offers both languages", async () => {
      await openSettings();

      const select = screen.getByRole("combobox", { name: "App language" });
      expect(select).toHaveValue("system");
      const options = within(select)
        .getAllByRole("option")
        .map((option) => option.textContent);
      expect(options).toEqual(["Follow the system", "Português (Brasil)", "English"]);
    });

    it("shows the saved language", async () => {
      mockSettings({ language: "pt-BR" });
      renderApp("/settings");

      expect(await screen.findByRole("combobox", { name: "Idioma do aplicativo" })).toHaveValue(
        "pt-BR",
      );
    });

    it("saves the chosen language", async () => {
      updateSettings.mockResolvedValue({
        status: "ok",
        data: { ...baseSettings, language: "pt-BR" },
      });
      await openSettings();

      await userEvent.selectOptions(
        screen.getByRole("combobox", { name: "App language" }),
        "Português (Brasil)",
      );

      await waitFor(() => expect(updateSettings).toHaveBeenCalledWith({ language: "pt-BR" }));
    });

    it("goes back to following the system with null", async () => {
      mockSettings({ language: "en" });
      updateSettings.mockResolvedValue({ status: "ok", data: baseSettings });
      await openSettings();

      await userEvent.selectOptions(
        screen.getByRole("combobox", { name: "App language" }),
        "Follow the system",
      );

      await waitFor(() => expect(updateSettings).toHaveBeenCalledWith({ language: null }));
    });
  });

  describe("user name", () => {
    const nameField = () => screen.getByRole("textbox", { name: "Name" });
    const saveButton = () => screen.getByRole("button", { name: "Save name" });

    it("starts with the saved name and nothing to save", async () => {
      await openSettings();

      expect(nameField()).toHaveValue("Ana");
      expect(saveButton()).toBeDisabled();
    });

    it("limits the name to 60 characters", async () => {
      await openSettings();

      expect(nameField()).toHaveAttribute("maxlength", "60");
    });

    it("does not allow saving an empty name", async () => {
      await openSettings();

      await userEvent.clear(nameField());

      expect(saveButton()).toBeDisabled();
    });

    it("does not allow saving a blank name", async () => {
      await openSettings();

      await userEvent.clear(nameField());
      await userEvent.type(nameField(), "   ");

      expect(saveButton()).toBeDisabled();
      expect(updateSettings).not.toHaveBeenCalled();
    });

    it("does not allow saving the same name, even with extra spaces", async () => {
      await openSettings();

      await userEvent.type(nameField(), "  ");

      expect(saveButton()).toBeDisabled();
    });

    it("saves the trimmed name and confirms", async () => {
      updateSettings.mockResolvedValue({
        status: "ok",
        data: { ...baseSettings, userName: "Bia" },
      });
      await openSettings();

      await userEvent.clear(nameField());
      await userEvent.type(nameField(), "  Bia ");
      await userEvent.click(saveButton());

      await waitFor(() => expect(updateSettings).toHaveBeenCalledWith({ userName: "Bia" }));
      expect(await screen.findByText("Name saved")).toBeInTheDocument();
    });

    it("submits with Enter", async () => {
      updateSettings.mockResolvedValue({
        status: "ok",
        data: { ...baseSettings, userName: "Bia" },
      });
      await openSettings();

      await userEvent.clear(nameField());
      await userEvent.type(nameField(), "Bia{Enter}");

      await waitFor(() => expect(updateSettings).toHaveBeenCalledWith({ userName: "Bia" }));
    });

    it("shows the error and keeps what was typed when saving fails", async () => {
      updateSettings.mockResolvedValue({
        status: "error",
        error: { code: "VALIDATION", message: "x" },
      });
      await openSettings();

      await userEvent.clear(nameField());
      await userEvent.type(nameField(), "Bia");
      await userEvent.click(saveButton());

      expect(await screen.findByText("The information provided is not valid.")).toBeInTheDocument();
      expect(nameField()).toHaveValue("Bia");
    });
  });

  describe("vault", () => {
    it("shows the current folder", async () => {
      await openSettings();

      expect(screen.getByText("C:\\ORBIT")).toBeInTheDocument();
    });

    it("sets up the picked folder and confirms", async () => {
      pickFile.mockResolvedValue("D:\\Other");
      setupVault.mockResolvedValue({
        status: "ok",
        data: { path: "D:\\Other", wasCreated: false, noteCount: 3 },
      });
      await openSettings();

      await userEvent.click(screen.getByRole("button", { name: "Change folder" }));

      await waitFor(() =>
        expect(setupVault).toHaveBeenCalledWith({ path: "D:\\Other", create: true }),
      );
      expect(pickFile).toHaveBeenCalledWith(expect.objectContaining({ directory: true }));
      expect(await screen.findByText("Folder updated")).toBeInTheDocument();
    });

    it("does nothing when the folder dialog is cancelled", async () => {
      await openSettings();

      await userEvent.click(screen.getByRole("button", { name: "Change folder" }));

      await waitFor(() => expect(pickFile).toHaveBeenCalled());
      expect(setupVault).not.toHaveBeenCalled();
    });

    it("does nothing when the same folder is picked again", async () => {
      pickFile.mockResolvedValue("C:\\ORBIT");
      await openSettings();

      await userEvent.click(screen.getByRole("button", { name: "Change folder" }));

      await waitFor(() => expect(pickFile).toHaveBeenCalled());
      expect(setupVault).not.toHaveBeenCalled();
    });

    it("shows the error when the folder cannot be used", async () => {
      pickFile.mockResolvedValue("D:\\Locked");
      setupVault.mockResolvedValue({ status: "error", error: { code: "IO", message: "denied" } });
      await openSettings();

      await userEvent.click(screen.getByRole("button", { name: "Change folder" }));

      expect(
        await screen.findByText("Could not access the files. Check the folder permissions."),
      ).toBeInTheDocument();
      expect(screen.queryByText("Folder updated")).not.toBeInTheDocument();
    });

    it("rebuilds the index and confirms", async () => {
      reindexVault.mockResolvedValue({ status: "ok", data: emptyIndexReport });
      await openSettings();

      await userEvent.click(screen.getByRole("button", { name: "Rebuild index" }));

      await waitFor(() => expect(reindexVault).toHaveBeenCalledTimes(1));
      expect(await screen.findByText("Index rebuilt")).toBeInTheDocument();
    });

    it("shows the error when the index cannot be rebuilt", async () => {
      reindexVault.mockResolvedValue({
        status: "error",
        error: { code: "NOT_FOUND", message: "x" },
      });
      await openSettings();

      await userEvent.click(screen.getByRole("button", { name: "Rebuild index" }));

      expect(
        await screen.findByText("The item was not found. It may have been removed."),
      ).toBeInTheDocument();
    });
  });

  describe("backup", () => {
    it("exports to the chosen file with a backup file name suggestion", async () => {
      pickDestination.mockResolvedValue("D:\\backups\\mine.db");
      exportDatabase.mockResolvedValue({
        status: "ok",
        data: { path: "D:\\backups\\mine.db", sizeBytes: 1024 },
      });
      await openSettings();

      await userEvent.click(screen.getByRole("button", { name: "Export backup" }));

      await waitFor(() =>
        expect(exportDatabase).toHaveBeenCalledWith({
          destinationPath: "D:\\backups\\mine.db",
          overwrite: true,
        }),
      );
      expect(pickDestination).toHaveBeenCalledWith(
        expect.objectContaining({
          defaultPath: expect.stringMatching(/^orbit-backup-\d{4}-\d{2}-\d{2}\.db$/),
        }),
      );
      expect(await screen.findByText("Backup saved")).toBeInTheDocument();
    });

    it("does not export when the save dialog is cancelled", async () => {
      await openSettings();

      await userEvent.click(screen.getByRole("button", { name: "Export backup" }));

      await waitFor(() => expect(pickDestination).toHaveBeenCalled());
      expect(exportDatabase).not.toHaveBeenCalled();
    });

    it("shows the error when the export fails", async () => {
      pickDestination.mockResolvedValue("D:\\backups\\mine.db");
      exportDatabase.mockResolvedValue({ status: "error", error: { code: "IO", message: "x" } });
      await openSettings();

      await userEvent.click(screen.getByRole("button", { name: "Export backup" }));

      expect(
        await screen.findByText("Could not access the files. Check the folder permissions."),
      ).toBeInTheDocument();
      expect(screen.queryByText("Backup saved")).not.toBeInTheDocument();
    });

    it("does not ask for confirmation or import when the file dialog is cancelled", async () => {
      await openSettings();

      await userEvent.click(screen.getByRole("button", { name: "Import backup" }));

      await waitFor(() => expect(pickFile).toHaveBeenCalled());
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
      expect(importDatabase).not.toHaveBeenCalled();
    });

    it("asks for confirmation, saying it replaces the current data, before importing", async () => {
      pickFile.mockResolvedValue("D:\\backups\\old.db");
      await openSettings();

      await userEvent.click(screen.getByRole("button", { name: "Import backup" }));

      const dialog = await screen.findByRole("alertdialog", { name: "Import this backup?" });
      expect(dialog).toHaveTextContent("replaces all your current data");
      expect(importDatabase).not.toHaveBeenCalled();
    });

    it("does not import when the confirmation is cancelled", async () => {
      pickFile.mockResolvedValue("D:\\backups\\old.db");
      await openSettings();
      await userEvent.click(screen.getByRole("button", { name: "Import backup" }));
      const dialog = await screen.findByRole("alertdialog");

      await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

      await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
      expect(importDatabase).not.toHaveBeenCalled();
    });

    it("imports after the confirmation, reloads the data and confirms", async () => {
      pickFile.mockResolvedValue("D:\\backups\\old.db");
      importDatabase.mockResolvedValue({
        status: "ok",
        data: {
          backupSchemaVersion: 1,
          currentSchemaVersion: 1,
          wasUpgraded: false,
          safetyBackupPath: null,
        },
      });
      await openSettings();
      const settingsCallsBefore = getSettings.mock.calls.length;
      await userEvent.click(screen.getByRole("button", { name: "Import backup" }));
      const dialog = await screen.findByRole("alertdialog");

      await userEvent.click(within(dialog).getByRole("button", { name: "Replace my data" }));

      await waitFor(() =>
        expect(importDatabase).toHaveBeenCalledWith({ sourcePath: "D:\\backups\\old.db" }),
      );
      expect(await screen.findByText("Backup imported")).toBeInTheDocument();
      await waitFor(() =>
        expect(getSettings.mock.calls.length).toBeGreaterThan(settingsCallsBefore),
      );
      await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    });

    it("closes the confirmation and shows the error when the import fails", async () => {
      pickFile.mockResolvedValue("D:\\backups\\bad.db");
      importDatabase.mockResolvedValue({
        status: "error",
        error: { code: "VALIDATION", message: "not a backup" },
      });
      await openSettings();
      await userEvent.click(screen.getByRole("button", { name: "Import backup" }));
      const dialog = await screen.findByRole("alertdialog");

      await userEvent.click(within(dialog).getByRole("button", { name: "Replace my data" }));

      expect(await screen.findByText("The information provided is not valid.")).toBeInTheDocument();
      await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
      expect(screen.queryByText("Backup imported")).not.toBeInTheDocument();
    });
  });

  describe("database status", () => {
    it("shows a healthy database", async () => {
      await openSettings();

      expect(await screen.findByText("All good")).toBeInTheDocument();
      expect(screen.queryByText(/integrity problem/)).not.toBeInTheDocument();
    });

    it("lists the problems found", async () => {
      getDatabaseStatus.mockResolvedValue({
        status: "ok",
        data: {
          state: "problems",
          integrityIssues: ["row 1 missing", "row 2 missing"],
          foreignKeyViolations: 1,
          checkedAt: new Date().toISOString(),
        },
      });
      await openSettings();

      expect(await screen.findByText("Problems found")).toBeInTheDocument();
      expect(screen.getByText("2 integrity problems")).toBeInTheDocument();
      expect(screen.getByText("1 broken reference")).toBeInTheDocument();
    });

    it("shows a check that could not run", async () => {
      getDatabaseStatus.mockResolvedValue({
        status: "ok",
        data: { state: "failed", integrityIssues: [], foreignKeyViolations: 0, checkedAt: null },
      });
      await openSettings();

      expect(await screen.findByText("Could not check")).toBeInTheDocument();
    });

    it("shows a check still in progress", async () => {
      getDatabaseStatus.mockResolvedValue({
        status: "ok",
        data: { state: "pending", integrityIssues: [], foreignKeyViolations: 0, checkedAt: null },
      });
      await openSettings();

      expect(await screen.findByText("Checking…")).toBeInTheDocument();
    });

    it("offers a retry when the status cannot be read", async () => {
      getDatabaseStatus.mockResolvedValueOnce({
        status: "error",
        error: { code: "DATABASE", message: "x" },
      });
      getDatabaseStatus.mockResolvedValue({ status: "ok", data: healthyStatus });
      await openSettings();

      expect(await screen.findByText("Could not check the database")).toBeInTheDocument();
      await userEvent.click(screen.getByRole("button", { name: "Try again" }));

      expect(await screen.findByText("All good")).toBeInTheDocument();
    });
  });

  describe("keyboard shortcuts", () => {
    it("lists the shortcuts the app responds to", async () => {
      await openSettings();

      const section = screen
        .getByRole("heading", { name: "Keyboard shortcuts" })
        .closest("section");
      expect(section).not.toBeNull();
      const list = within(section as HTMLElement).getByRole("list");
      const items = within(list).getAllByRole("listitem");
      expect(items.map((item) => item.textContent)).toEqual([
        "Open searchCtrlK",
        "Collapse or expand the menuCtrl\\",
        "Save a formCtrlEnter",
        "New projectCtrlShiftP",
        "New taskCtrlShiftT",
        "New boardCtrlShiftB",
        "New noteCtrlShiftN",
      ]);
    });
  });

  describe("in pt-BR", () => {
    it("is fully translated", async () => {
      mockSettings({ language: "pt-BR" });
      renderApp("/settings");

      expect(await screen.findByRole("heading", { name: "Idioma" })).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "Backup" })).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "Atalhos do teclado" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Reconstruir índice" })).toBeInTheDocument();
      expect(screen.getByText("Nova tarefa")).toBeInTheDocument();
    });
  });
});
