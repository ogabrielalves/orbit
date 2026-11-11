import { open } from "@tauri-apps/plugin-dialog";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { commands, type Settings } from "@/bindings";
import { i18next } from "@/i18n";
import { renderApp } from "@/test/renderApp";

const getSettings = vi.mocked(commands.getSettings);
const updateSettings = vi.mocked(commands.updateSettings);
const setupVault = vi.mocked(commands.setupVault);
const pickFolder = vi.mocked(open);

function mockSettings(settings: Partial<Settings>) {
  getSettings.mockResolvedValue({
    status: "ok",
    data: { language: null, vaultPath: null, userName: null, ...settings },
  });
}

async function fillName(name: string) {
  await userEvent.type(
    await screen.findByRole("textbox", { name: "What should we call you?" }),
    name,
  );
}

async function chooseFolder(path: string) {
  pickFolder.mockResolvedValue(path);
  await userEvent.click(screen.getByRole("button", { name: "Choose folder" }));
  await screen.findByText(path);
}

const startButton = () => screen.getByRole("button", { name: "Get started" });

describe("welcome screen", () => {
  beforeEach(async () => {
    await i18next.changeLanguage("en");
    for (const command of [getSettings, updateSettings, setupVault, pickFolder]) {
      command.mockReset();
    }
    mockSettings({});
  });

  describe("guard", () => {
    it("shows nothing while the settings load", async () => {
      getSettings.mockReturnValue(new Promise(() => undefined));
      renderApp("/");

      await waitFor(() => expect(getSettings).toHaveBeenCalled());

      expect(screen.queryByRole("heading", { level: 1 })).not.toBeInTheDocument();
      expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
    });

    it("sends to /welcome when there is no vault", async () => {
      mockSettings({ userName: "Ana" });
      const router = renderApp("/projects");

      expect(await screen.findByRole("heading", { name: "Welcome to ORBIT" })).toBeInTheDocument();
      expect(router.state.location.pathname).toBe("/welcome");
    });

    it("sends to /welcome when there is no name", async () => {
      mockSettings({ vaultPath: "/vault" });
      const router = renderApp("/");

      expect(await screen.findByRole("heading", { name: "Welcome to ORBIT" })).toBeInTheDocument();
      expect(router.state.location.pathname).toBe("/welcome");
    });

    it("sends /welcome to the dashboard once both are set", async () => {
      mockSettings({ vaultPath: "/vault", userName: "Ana" });
      const router = renderApp("/welcome");

      expect(
        await screen.findByRole("heading", {
          level: 1,
          name: /^Good (morning|afternoon|evening), Ana$/,
        }),
      ).toBeInTheDocument();
      expect(router.state.location.pathname).toBe("/");
    });

    it("lets the app run when both are set", async () => {
      mockSettings({ vaultPath: "/vault", userName: "Ana" });
      const router = renderApp("/projects");

      expect(
        await screen.findByRole("navigation", { name: "Main navigation" }),
      ).toBeInTheDocument();
      expect(router.state.location.pathname).toBe("/projects");
    });

    it("renders without the sidebar and the top bar", async () => {
      renderApp("/welcome");

      await screen.findByRole("heading", { name: "Welcome to ORBIT" });

      expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
      expect(screen.queryByRole("banner")).not.toBeInTheDocument();
    });
  });

  describe("form", () => {
    it("keeps the button disabled until there is a name and a folder", async () => {
      renderApp("/welcome");
      await screen.findByRole("heading", { name: "Welcome to ORBIT" });
      expect(startButton()).toBeDisabled();

      await fillName("Ana");
      expect(startButton()).toBeDisabled();

      await chooseFolder("C:\\ORBIT");
      expect(startButton()).toBeEnabled();
    });

    it("does not accept a blank name", async () => {
      renderApp("/welcome");
      await screen.findByRole("heading", { name: "Welcome to ORBIT" });
      await chooseFolder("C:\\ORBIT");

      await fillName("   ");

      expect(startButton()).toBeDisabled();
    });

    it("limits the name to 60 characters", async () => {
      renderApp("/welcome");

      const input = await screen.findByRole("textbox", { name: "What should we call you?" });

      expect(input).toHaveAttribute("maxlength", "60");
    });

    it("shows the chosen path and lets the user change it", async () => {
      renderApp("/welcome");
      expect(await screen.findByText("No folder chosen")).toBeInTheDocument();

      await chooseFolder("C:\\ORBIT");
      expect(screen.queryByText("No folder chosen")).not.toBeInTheDocument();

      pickFolder.mockResolvedValue("D:\\Other");
      await userEvent.click(screen.getByRole("button", { name: "Change folder" }));

      expect(await screen.findByText("D:\\Other")).toBeInTheDocument();
    });

    it("keeps the previous state when the folder dialog is cancelled", async () => {
      pickFolder.mockResolvedValue(null);
      renderApp("/welcome");

      await userEvent.click(await screen.findByRole("button", { name: "Choose folder" }));

      expect(screen.getByText("No folder chosen")).toBeInTheDocument();
    });
  });

  describe("submit", () => {
    it("sets the vault up first, then saves the trimmed name and opens the dashboard", async () => {
      let saved: Settings = { language: null, vaultPath: null, userName: null };
      getSettings.mockImplementation(async () => ({ status: "ok", data: saved }));
      setupVault.mockImplementation(async (input) => {
        saved = { ...saved, vaultPath: input.path };
        return { status: "ok", data: { path: input.path, wasCreated: false, noteCount: 0 } };
      });
      updateSettings.mockImplementation(async (input) => {
        saved = { ...saved, userName: input.userName ?? null };
        return { status: "ok", data: saved };
      });
      const router = renderApp("/welcome");
      await fillName("  Ana ");
      await chooseFolder("C:\\ORBIT");

      await userEvent.click(startButton());

      await waitFor(() => expect(router.state.location.pathname).toBe("/"));
      expect(setupVault).toHaveBeenCalledWith({ path: "C:\\ORBIT", create: true });
      expect(updateSettings).toHaveBeenCalledWith({ userName: "Ana" });
      const setupOrder = setupVault.mock.invocationCallOrder[0] ?? 0;
      const saveOrder = updateSettings.mock.invocationCallOrder[0] ?? 0;
      expect(setupOrder).toBeLessThan(saveOrder);
    });

    describe("with a vault that is already saved", () => {
      let saved: Settings;

      beforeEach(() => {
        saved = { language: null, vaultPath: "C:\\ORBIT", userName: null };
        getSettings.mockImplementation(async () => ({ status: "ok", data: saved }));
        setupVault.mockImplementation(async (input) => {
          saved = { ...saved, vaultPath: input.path };
          return { status: "ok", data: { path: input.path, wasCreated: false, noteCount: 0 } };
        });
        updateSettings.mockImplementation(async (input) => {
          saved = { ...saved, userName: input.userName ?? null };
          return { status: "ok", data: saved };
        });
      });

      it("pre-fills the saved folder and only needs the name", async () => {
        renderApp("/");

        expect(await screen.findByText("C:\\ORBIT")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Change folder" })).toBeInTheDocument();
        expect(startButton()).toBeDisabled();

        await fillName("Ana");

        expect(startButton()).toBeEnabled();
      });

      it("only saves the name when the folder was not changed", async () => {
        const router = renderApp("/");
        await fillName("Ana");

        await userEvent.click(startButton());

        await waitFor(() => expect(router.state.location.pathname).toBe("/"));
        expect(updateSettings).toHaveBeenCalledWith({ userName: "Ana" });
        expect(setupVault).not.toHaveBeenCalled();
      });

      it("does not set the vault up again when the same folder is picked", async () => {
        const router = renderApp("/");
        await fillName("Ana");
        pickFolder.mockResolvedValue("C:\\ORBIT");
        await userEvent.click(await screen.findByRole("button", { name: "Change folder" }));

        await userEvent.click(startButton());

        await waitFor(() => expect(router.state.location.pathname).toBe("/"));
        expect(setupVault).not.toHaveBeenCalled();
        expect(updateSettings).toHaveBeenCalledWith({ userName: "Ana" });
      });

      it("sets the new folder up before saving the name when it was changed", async () => {
        const router = renderApp("/");
        await fillName("Ana");
        pickFolder.mockResolvedValue("D:\\Other");
        await userEvent.click(await screen.findByRole("button", { name: "Change folder" }));
        await screen.findByText("D:\\Other");

        await userEvent.click(startButton());

        await waitFor(() => expect(router.state.location.pathname).toBe("/"));
        expect(setupVault).toHaveBeenCalledWith({ path: "D:\\Other", create: true });
        expect(updateSettings).toHaveBeenCalledWith({ userName: "Ana" });
        const setupOrder = setupVault.mock.invocationCallOrder[0] ?? 0;
        const saveOrder = updateSettings.mock.invocationCallOrder[0] ?? 0;
        expect(setupOrder).toBeLessThan(saveOrder);
      });
    });

    it("shows the error and does not save the name when the vault setup fails", async () => {
      setupVault.mockResolvedValue({ status: "error", error: { code: "IO", message: "denied" } });
      const router = renderApp("/welcome");
      await fillName("Ana");
      await chooseFolder("C:\\ORBIT");

      await userEvent.click(startButton());

      expect(await screen.findByRole("alert")).toHaveTextContent(
        "Could not access the files. Check the folder permissions.",
      );
      expect(updateSettings).not.toHaveBeenCalled();
      expect(router.state.location.pathname).toBe("/welcome");
      expect(startButton()).toBeEnabled();
    });

    it("greets the dashboard with the saved name", async () => {
      mockSettings({ vaultPath: "/vault", userName: "Ana" });
      renderApp("/");

      expect(await screen.findByRole("heading", { level: 1, name: /, Ana$/ })).toBeInTheDocument();
    });
  });
});
