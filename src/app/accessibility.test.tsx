import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { commands } from "@/bindings";
import { i18next } from "@/i18n";
import { createProjectFixture } from "@/test/projectFixture";
import { renderApp } from "@/test/renderApp";

const getSettings = vi.mocked(commands.getSettings);
const getProject = vi.mocked(commands.getProject);
const listProjects = vi.mocked(commands.listProjects);

function settings(language: "en" | "pt-BR" | null, userName: string | null = "Gabriel") {
  getSettings.mockResolvedValue({
    status: "ok",
    data: { language, vaultPath: "/vault", userName },
  });
}

async function waitForShell() {
  await screen.findByRole("main");
}

describe("page accessibility", () => {
  beforeEach(async () => {
    await i18next.changeLanguage("en");
    getSettings.mockReset();
    getProject.mockReset();
    listProjects.mockReset();
    settings("en");
    listProjects.mockResolvedValue({
      status: "ok",
      data: [createProjectFixture({ id: "p1", name: "Website 2.0" })],
    });
    getProject.mockResolvedValue({
      status: "ok",
      data: {
        project: createProjectFixture({ id: "p1", name: "Website 2.0" }),
        boards: [],
        taskCount: 0,
        backlogTaskCount: 0,
      },
    });
    document.title = "";
    document.documentElement.lang = "pt-BR";
  });

  describe("document language and title", () => {
    it("sets the page language from the app language", async () => {
      renderApp("/backlog");
      await waitForShell();

      await waitFor(() => expect(document.documentElement.lang).toBe("en"));

      await i18next.changeLanguage("pt-BR");

      await waitFor(() => expect(document.documentElement.lang).toBe("pt-BR"));
    });

    it("titles each page", async () => {
      renderApp("/backlog");

      await waitFor(() => expect(document.title).toBe("Backlog · ORBIT"));
    });

    it("includes the project name on the project page", async () => {
      renderApp("/projects/p1");

      await waitFor(() => expect(document.title).toBe("Website 2.0 · My projects · ORBIT"));
    });

    it("titles the welcome screen", async () => {
      getSettings.mockResolvedValue({
        status: "ok",
        data: { language: "en", vaultPath: null, userName: null },
      });
      renderApp("/welcome");

      await waitFor(() => expect(document.title).toBe("Welcome · ORBIT"));
    });

    it("follows the language in the title", async () => {
      settings("pt-BR");
      renderApp("/backlog");

      await waitFor(() => expect(document.title).toBe("Backlog · ORBIT"));
      await waitFor(() => expect(document.documentElement.lang).toBe("pt-BR"));
    });
  });

  describe("skip link", () => {
    it("is the first thing the keyboard reaches and says what it does", async () => {
      renderApp("/backlog");
      await waitForShell();

      await userEvent.tab();

      expect(screen.getByRole("link", { name: "Skip to content" })).toHaveFocus();
    });

    it("moves the focus to the main content", async () => {
      renderApp("/backlog");
      await waitForShell();
      await userEvent.tab();

      await userEvent.keyboard("{Enter}");

      expect(screen.getByRole("main")).toHaveFocus();
    });

    it("is hidden until it gets the focus", async () => {
      renderApp("/backlog");
      await waitForShell();

      expect(screen.getByRole("link", { name: "Skip to content" })).toHaveClass("sr-only");
    });

    it("is not on the welcome screen", async () => {
      getSettings.mockResolvedValue({
        status: "ok",
        data: { language: "en", vaultPath: null, userName: null },
      });
      renderApp("/welcome");
      await screen.findByRole("heading", { name: "Welcome to ORBIT" });

      expect(screen.queryByRole("link", { name: "Skip to content" })).not.toBeInTheDocument();
    });
  });

  describe("focus on navigation", () => {
    it("does not move the focus on the first load", async () => {
      renderApp("/backlog");
      await waitForShell();

      expect(screen.getByRole("main")).not.toHaveFocus();
      expect(document.body).toHaveFocus();
    });

    it("moves the focus to the main content when the page changes", async () => {
      renderApp("/");
      await waitForShell();

      await userEvent.click(screen.getByRole("link", { name: "Backlog" }));

      await waitFor(() => expect(screen.getByRole("main")).toHaveFocus());
    });

    it("announces the new page", async () => {
      renderApp("/");
      await waitForShell();
      expect(screen.queryByText("Backlog · ORBIT")).not.toBeInTheDocument();

      await userEvent.click(screen.getByRole("link", { name: "Backlog" }));

      expect(await screen.findByText("Backlog · ORBIT")).toBeInTheDocument();
    });

    it("does not move the focus when only the search changes", async () => {
      renderApp("/projects");
      const search = await screen.findByRole("searchbox", { name: "Search projects" });
      await userEvent.click(search);

      await userEvent.type(search, "web");

      await waitFor(() => expect(search).toHaveValue("web"));
      expect(search).toHaveFocus();
    });

    it("does not take the focus from a dialog that opens with the navigation", async () => {
      renderApp("/");
      await waitForShell();

      await userEvent.keyboard("{Control>}{Shift>}p{/Shift}{/Control}");

      const dialog = await screen.findByRole("dialog", { name: "New project" });
      await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
      expect(screen.getByRole("main", { hidden: true })).not.toHaveFocus();
    });
  });
});
