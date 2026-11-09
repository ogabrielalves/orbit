import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { commands, type ProjectDetails } from "@/bindings";
import { i18next } from "@/i18n";
import { createBoardDetailsFixture } from "@/test/boardFixture";
import { createProjectFixture } from "@/test/projectFixture";
import { renderApp } from "@/test/renderApp";

const getProject = vi.mocked(commands.getProject);
const updateProject = vi.mocked(commands.updateProject);
const archiveProject = vi.mocked(commands.archiveProject);
const restoreProject = vi.mocked(commands.restoreProject);
const deleteProject = vi.mocked(commands.deleteProject);

function createDetails(overrides: Partial<ProjectDetails> = {}): ProjectDetails {
  return {
    project: createProjectFixture({ id: "p1" }),
    boards: [],
    taskCount: 0,
    backlogTaskCount: 0,
    ...overrides,
  };
}

function mockDetails(details: ProjectDetails) {
  getProject.mockResolvedValue({ status: "ok", data: details });
}

async function openMenu(item: string) {
  await userEvent.click(await screen.findByRole("button", { name: "Project actions" }));
  await userEvent.click(await screen.findByRole("menuitem", { name: item }));
}

const createBoard = vi.mocked(commands.createBoard);
const getBoard = vi.mocked(commands.getBoard);

describe("ProjectDetailPage", () => {
  beforeEach(async () => {
    await i18next.changeLanguage("en");
    for (const command of [
      getProject,
      updateProject,
      archiveProject,
      restoreProject,
      deleteProject,
      createBoard,
      getBoard,
    ]) {
      command.mockReset();
    }
    vi.mocked(commands.listProjects).mockResolvedValue({ status: "ok", data: [] });
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-08T12:12:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("states", () => {
    it("loads the project named in the URL", async () => {
      mockDetails(createDetails());
      renderApp("/projects/p1");

      await screen.findByRole("heading", { level: 1, name: "Website 2.0" });

      expect(getProject).toHaveBeenCalledWith("p1");
    });

    it("shows a loading placeholder while the project loads", async () => {
      getProject.mockReturnValue(new Promise(() => undefined));
      renderApp("/projects/p1");

      expect(await screen.findByRole("status")).toHaveTextContent("Loading…");
      expect(screen.queryByRole("heading", { level: 1 })).not.toBeInTheDocument();
    });

    it("explains a missing project and still offers the way back", async () => {
      getProject.mockResolvedValue({
        status: "error",
        error: { code: "NOT_FOUND", message: "project not found" },
      });
      renderApp("/projects/missing");

      const alert = await screen.findByRole("alert");

      expect(alert).toHaveTextContent("Could not load the project");
      expect(alert).toHaveTextContent("The item was not found. It may have been removed.");
      expect(screen.getByRole("link", { name: "Back to projects" })).toBeInTheDocument();
    });

    it("translates an internal error without leaking its details", async () => {
      getProject.mockResolvedValue({
        status: "error",
        error: { code: "INTERNAL", message: "panic at src/db.rs:42" },
      });
      renderApp("/projects/p1");

      const alert = await screen.findByRole("alert");

      expect(alert).toHaveTextContent("An internal error occurred. Please try again.");
      expect(alert).not.toHaveTextContent("panic");
    });

    it("retries loading from the error state", async () => {
      getProject.mockResolvedValueOnce({
        status: "error",
        error: { code: "DATABASE", message: "x" },
      });
      mockDetails(createDetails());
      renderApp("/projects/p1");

      await userEvent.click(await screen.findByRole("button", { name: "Try again" }));

      expect(
        await screen.findByRole("heading", { level: 1, name: "Website 2.0" }),
      ).toBeInTheDocument();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    it("goes back to the projects list", async () => {
      mockDetails(createDetails());
      renderApp("/projects/p1");

      await userEvent.click(await screen.findByRole("link", { name: "Back to projects" }));

      expect(
        await screen.findByRole("heading", { level: 1, name: "My projects" }),
      ).toBeInTheDocument();
    });
  });

  describe("content", () => {
    it("shows the project identity", async () => {
      mockDetails(
        createDetails({
          project: createProjectFixture({
            id: "p1",
            name: "Fintech",
            description: "Wallet app",
            status: "paused",
            color: "ember",
          }),
        }),
      );
      renderApp("/projects/p1");

      expect(await screen.findByRole("heading", { level: 1, name: "Fintech" })).toBeInTheDocument();
      expect(screen.getByText("Wallet app")).toBeInTheDocument();
      expect(screen.getByText("Paused")).toBeInTheDocument();
      expect(screen.getByText("F").style.color).toBe("var(--color-project-ember)");
    });

    it("shows when it was created and last updated", async () => {
      mockDetails(createDetails());
      renderApp("/projects/p1");

      expect(
        await screen.findByText("Created Sep 2, 2026 · Updated 12 minutes ago"),
      ).toBeInTheDocument();
    });

    it("omits the description when there is none", async () => {
      mockDetails(createDetails({ project: createProjectFixture({ id: "p1", description: "" }) }));
      renderApp("/projects/p1");

      await screen.findByRole("heading", { level: 1 });

      expect(screen.queryByText("Redesign of the company site.")).not.toBeInTheDocument();
    });

    it("marks an archived project", async () => {
      mockDetails(
        createDetails({
          project: createProjectFixture({ id: "p1", archivedAt: "2026-11-01T00:00:00Z" }),
        }),
      );
      renderApp("/projects/p1");

      expect(await screen.findByText("Archived")).toBeInTheDocument();
    });

    it("does not mark an active project as archived", async () => {
      mockDetails(createDetails());
      renderApp("/projects/p1");
      await screen.findByRole("heading", { level: 1 });

      expect(screen.queryByText("Archived")).not.toBeInTheDocument();
    });

    it("summarizes tasks, backlog and boards", async () => {
      mockDetails(
        createDetails({
          taskCount: 12,
          backlogTaskCount: 3,
          boards: [
            { id: "b1", name: "Sprint 1", createdAt: "2026-09-03T12:00:00Z", taskCount: 9 },
            { id: "b2", name: "Ideas", createdAt: "2026-09-04T12:00:00Z", taskCount: 3 },
          ],
        }),
      );
      renderApp("/projects/p1");

      const summary = await screen.findByLabelText("Project summary");

      expect(within(summary).getByText("Tasks").nextElementSibling).toHaveTextContent("12");
      expect(within(summary).getByText("In the backlog").nextElementSibling).toHaveTextContent("3");
      expect(within(summary).getByText("Boards").nextElementSibling).toHaveTextContent("2");
    });

    it("lists the boards with their task counts and links", async () => {
      mockDetails(
        createDetails({
          boards: [
            { id: "b1", name: "Sprint 1", createdAt: "2026-09-03T12:00:00Z", taskCount: 9 },
            { id: "b2", name: "Ideas", createdAt: "2026-09-04T12:00:00Z", taskCount: 1 },
          ],
        }),
      );
      renderApp("/projects/p1");

      const sprint = await screen.findByRole("link", { name: /Sprint 1/ });
      const ideas = screen.getByRole("link", { name: /Ideas/ });

      expect(sprint).toHaveAttribute("href", "/boards/b1");
      expect(sprint).toHaveTextContent("9 tasks");
      expect(ideas).toHaveAttribute("href", "/boards/b2");
      expect(ideas).toHaveTextContent("1 task");
      expect(ideas).not.toHaveTextContent("1 tasks");
    });

    it("shows an empty state when the project has no boards", async () => {
      mockDetails(createDetails());
      renderApp("/projects/p1");

      expect(await screen.findByRole("heading", { name: "No boards yet" })).toBeInTheDocument();
      expect(screen.getByText("The boards of this project will appear here.")).toBeInTheDocument();
    });
  });

  describe("new board", () => {
    it("creates a board from the sprint template and opens it", async () => {
      mockDetails(createDetails());
      const created = createBoardDetailsFixture();
      createBoard.mockResolvedValue({ status: "ok", data: created });
      getBoard.mockResolvedValue({ status: "ok", data: created });
      renderApp("/projects/p1");

      await userEvent.click(await screen.findByRole("button", { name: "New board" }));
      expect(await screen.findByRole("radio", { name: /Sprint/ })).toBeChecked();
      await userEvent.type(screen.getByRole("textbox", { name: "Board name" }), "Sprint 14");
      await userEvent.click(screen.getByRole("button", { name: "Create board" }));

      expect(await screen.findByRole("heading", { name: "Sprint 14" })).toBeInTheDocument();
      expect(createBoard).toHaveBeenCalledWith({
        projectId: "p1",
        name: "Sprint 14",
        columns: [
          { name: "Backlog", kind: "todo" },
          { name: "To do", kind: "todo" },
          { name: "In progress", kind: "in_progress" },
          { name: "In review", kind: "in_progress" },
          { name: "Done", kind: "done" },
        ],
      });
    });

    it("sends the column names in the current language", async () => {
      vi.mocked(commands.getSettings).mockResolvedValueOnce({
        status: "ok",
        data: { language: "pt-BR", vaultPath: null },
      });
      mockDetails(createDetails());
      createBoard.mockResolvedValue({ status: "ok", data: createBoardDetailsFixture() });
      renderApp("/projects/p1");

      await userEvent.click(await screen.findByRole("button", { name: "Novo quadro" }));
      await userEvent.type(await screen.findByRole("textbox", { name: "Nome do quadro" }), "X");
      await userEvent.click(screen.getByRole("button", { name: "Criar quadro" }));

      await waitFor(() => expect(createBoard).toHaveBeenCalledTimes(1));
      expect(createBoard.mock.calls[0]?.[0].columns?.map((column) => column.name)).toEqual([
        "Backlog",
        "A fazer",
        "Em progresso",
        "Em revisão",
        "Concluído",
      ]);
    });

    it("keeps the form open and the typed name when creation fails", async () => {
      mockDetails(createDetails());
      createBoard.mockResolvedValue({
        status: "error",
        error: { code: "DATABASE", message: "x" },
      });
      renderApp("/projects/p1");

      await userEvent.click(await screen.findByRole("button", { name: "New board" }));
      await userEvent.type(await screen.findByRole("textbox", { name: "Board name" }), "Keep");
      await userEvent.click(screen.getByRole("button", { name: "Create board" }));

      await waitFor(() => expect(createBoard).toHaveBeenCalledTimes(1));
      expect(screen.getByRole("dialog", { name: "New board" })).toBeInTheDocument();
      expect(screen.getByRole("textbox", { name: "Board name" })).toHaveValue("Keep");
    });

    it("does not offer a new board for an archived project", async () => {
      mockDetails(
        createDetails({
          project: createProjectFixture({
            id: "p1",
            status: "completed",
            archivedAt: "2026-11-01T12:00:00Z",
          }),
        }),
      );
      renderApp("/projects/p1");
      await screen.findByRole("heading", { name: "Boards" });

      expect(screen.queryByRole("button", { name: "New board" })).not.toBeInTheDocument();
    });

    it("closes the form without creating anything", async () => {
      mockDetails(createDetails());
      renderApp("/projects/p1");
      await userEvent.click(await screen.findByRole("button", { name: "New board" }));

      await userEvent.click(await screen.findByRole("button", { name: "Cancel" }));

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(createBoard).not.toHaveBeenCalled();
    });
  });

  describe("actions", () => {
    it("edits the project and shows the new name afterwards", async () => {
      mockDetails(createDetails());
      updateProject.mockResolvedValue({
        status: "ok",
        data: createProjectFixture({ id: "p1", name: "Website 3.0" }),
      });
      renderApp("/projects/p1");
      await userEvent.click(await screen.findByRole("button", { name: "Edit" }));

      const nameField = await screen.findByRole("textbox", { name: "Project name" });
      expect(nameField).toHaveValue("Website 2.0");
      await userEvent.clear(nameField);
      await userEvent.type(nameField, "Website 3.0");
      mockDetails(
        createDetails({ project: createProjectFixture({ id: "p1", name: "Website 3.0" }) }),
      );
      await userEvent.click(screen.getByRole("button", { name: "Save changes" }));

      expect(
        await screen.findByRole("heading", { level: 1, name: "Website 3.0" }),
      ).toBeInTheDocument();
      expect(updateProject).toHaveBeenCalledWith(
        "p1",
        expect.objectContaining({ name: "Website 3.0" }),
      );
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("archives after confirming and shows the archived mark", async () => {
      mockDetails(createDetails());
      archiveProject.mockResolvedValue({ status: "ok", data: createProjectFixture({ id: "p1" }) });
      renderApp("/projects/p1");
      await openMenu("Archive");

      mockDetails(
        createDetails({
          project: createProjectFixture({ id: "p1", archivedAt: "2026-11-08T12:00:00Z" }),
        }),
      );
      await userEvent.click(await screen.findByRole("button", { name: "Archive" }));

      expect(await screen.findByText("Archived")).toBeInTheDocument();
      expect(archiveProject).toHaveBeenCalledWith("p1");
    });

    it("offers restore instead of archive for an archived project and restores it", async () => {
      mockDetails(
        createDetails({
          project: createProjectFixture({ id: "p1", archivedAt: "2026-11-01T00:00:00Z" }),
        }),
      );
      restoreProject.mockResolvedValue({ status: "ok", data: createProjectFixture({ id: "p1" }) });
      renderApp("/projects/p1");
      await userEvent.click(await screen.findByRole("button", { name: "Project actions" }));
      expect(screen.queryByRole("menuitem", { name: "Archive" })).not.toBeInTheDocument();
      await userEvent.click(await screen.findByRole("menuitem", { name: "Restore" }));

      mockDetails(createDetails());
      await userEvent.click(await screen.findByRole("button", { name: "Restore" }));

      await waitFor(() => expect(screen.queryByText("Archived")).not.toBeInTheDocument());
      expect(restoreProject).toHaveBeenCalledWith("p1");
    });

    it("keeps the project when the confirmation is cancelled", async () => {
      mockDetails(createDetails());
      renderApp("/projects/p1");
      await openMenu("Archive");

      await userEvent.click(await screen.findByRole("button", { name: "Cancel" }));

      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
      expect(archiveProject).not.toHaveBeenCalled();
    });

    it("deletes after typing the name and returns to the projects list", async () => {
      mockDetails(createDetails());
      deleteProject.mockResolvedValue({ status: "ok", data: null });
      const router = renderApp("/projects/p1");
      await openMenu("Delete…");
      const confirm = await screen.findByRole("button", { name: "Delete" });
      expect(confirm).toBeDisabled();

      await userEvent.type(screen.getByRole("textbox"), "Website 2.0");
      await userEvent.click(confirm);

      expect(
        await screen.findByRole("heading", { level: 1, name: "My projects" }),
      ).toBeInTheDocument();
      expect(deleteProject).toHaveBeenCalledWith("p1");
      expect(router.state.location.pathname).toBe("/projects");
      expect(getProject).toHaveBeenCalledTimes(1);
    });

    it("stays on the project when the backend refuses to delete", async () => {
      mockDetails(createDetails());
      deleteProject.mockResolvedValue({
        status: "error",
        error: { code: "DATABASE", message: "x" },
      });
      const router = renderApp("/projects/p1");
      await openMenu("Delete…");

      await userEvent.type(await screen.findByRole("textbox"), "Website 2.0");
      await userEvent.click(screen.getByRole("button", { name: "Delete" }));

      expect(await screen.findByText("Could not access the application data.")).toBeInTheDocument();
      expect(router.state.location.pathname).toBe("/projects/p1");
      expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    });
  });

  it("follows the language saved in the settings", async () => {
    vi.mocked(commands.getSettings).mockResolvedValueOnce({
      status: "ok",
      data: { language: "pt-BR", vaultPath: null },
    });
    mockDetails(
      createDetails({
        boards: [{ id: "b1", name: "Sprint 1", createdAt: "2026-09-03T12:00:00Z", taskCount: 2 }],
      }),
    );
    renderApp("/projects/p1");

    expect(await screen.findByRole("link", { name: "Voltar para projetos" })).toBeInTheDocument();
    expect(screen.getByText("Ativo")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Sprint 1/ })).toHaveTextContent("2 tarefas");
  });
});
