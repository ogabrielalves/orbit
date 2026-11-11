import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { commands, type Project } from "@/bindings";
import { i18next } from "@/i18n";
import { createProjectFixture } from "@/test/projectFixture";
import { renderApp } from "@/test/renderApp";

const listProjects = vi.mocked(commands.listProjects);
const createProject = vi.mocked(commands.createProject);
const updateProject = vi.mocked(commands.updateProject);
const archiveProject = vi.mocked(commands.archiveProject);
const restoreProject = vi.mocked(commands.restoreProject);
const deleteProject = vi.mocked(commands.deleteProject);

const alpha = createProjectFixture({
  id: "a",
  name: "Alpha",
  description: "First project",
  createdAt: "2026-01-01T12:00:00Z",
  updatedAt: "2026-02-01T12:00:00Z",
});
const beta = createProjectFixture({
  id: "b",
  name: "Beta",
  description: "",
  status: "paused",
  createdAt: "2026-03-01T12:00:00Z",
  updatedAt: "2026-04-01T12:00:00Z",
});

function mockProjects(projects: Project[]) {
  listProjects.mockResolvedValue({ status: "ok", data: projects });
}

function cardNames(): string[] {
  return screen
    .getAllByRole("article")
    .map((card) => within(card).getByRole("link").textContent ?? "");
}

describe("ProjectsPage", () => {
  beforeEach(async () => {
    await i18next.changeLanguage("en");
    for (const command of [
      listProjects,
      createProject,
      updateProject,
      archiveProject,
      restoreProject,
      deleteProject,
    ]) {
      command.mockReset();
    }
    mockProjects([]);
  });

  describe("states", () => {
    it("shows a loading placeholder while the projects load", async () => {
      listProjects.mockReturnValue(new Promise(() => undefined));
      renderApp("/projects");

      expect(await screen.findByRole("status")).toHaveTextContent("Loading…");
      expect(screen.queryByRole("article")).not.toBeInTheDocument();
    });

    it("shows the empty state with a way to create the first project", async () => {
      renderApp("/projects");

      expect(await screen.findByRole("heading", { name: "No projects yet" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Create project" })).toBeInTheDocument();
      expect(screen.queryByRole("article")).not.toBeInTheDocument();
    });

    it("shows the archived empty state without a create button", async () => {
      renderApp("/projects?scope=archived");

      expect(
        await screen.findByRole("heading", { name: "No archived projects" }),
      ).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Create project" })).not.toBeInTheDocument();
    });

    it("shows an error with a retry that loads the list again", async () => {
      listProjects.mockResolvedValueOnce({
        status: "error",
        error: { code: "DATABASE", message: "a database operation failed" },
      });
      mockProjects([alpha]);
      renderApp("/projects");

      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent("Could not load the projects");
      expect(alert).toHaveTextContent("Could not access the application data.");

      await userEvent.click(within(alert).getByRole("button", { name: "Try again" }));

      expect(await screen.findByRole("link", { name: "Alpha" })).toBeInTheDocument();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    it("explains when the filters hide every project and lets you clear them", async () => {
      const router = renderApp("/projects?q=zzz&status=paused");

      expect(await screen.findByRole("heading", { name: "No projects found" })).toBeInTheDocument();
      await userEvent.click(screen.getByRole("button", { name: "Clear filters" }));

      await waitFor(() => expect(router.state.location.search).not.toHaveProperty("q"));
      expect(router.state.location.search).not.toHaveProperty("status");
      expect(screen.getByRole("searchbox")).toHaveValue("");
    });
  });

  describe("list", () => {
    it("lists every project with its details", async () => {
      mockProjects([alpha, beta]);
      renderApp("/projects");

      expect(await screen.findByRole("link", { name: "Alpha" })).toHaveAttribute(
        "href",
        "/projects/a",
      );
      expect(screen.getByRole("link", { name: "Beta" })).toBeInTheDocument();
      expect(screen.getByText("First project")).toBeInTheDocument();
      const betaCard = screen.getByRole("link", { name: "Beta" }).closest("article") as HTMLElement;
      expect(within(betaCard).getByText("Paused")).toBeInTheDocument();
      expect(screen.getByText("No description")).toBeInTheDocument();
    });

    it("counts a single project in the singular", async () => {
      mockProjects([alpha]);
      renderApp("/projects");

      expect(await screen.findByText("1 project")).toBeInTheDocument();
    });

    it("counts several projects in the plural", async () => {
      mockProjects([alpha, beta]);
      renderApp("/projects");

      expect(await screen.findByText("2 projects")).toBeInTheDocument();
    });

    it("orders by most recently updated by default", async () => {
      mockProjects([alpha, beta]);
      renderApp("/projects");
      await screen.findByRole("link", { name: "Alpha" });

      expect(cardNames()).toEqual(["Beta", "Alpha"]);
    });

    it("orders by name or by creation date from the sort control", async () => {
      mockProjects([beta, alpha]);
      renderApp("/projects?sort=name");
      await screen.findByRole("link", { name: "Alpha" });
      expect(cardNames()).toEqual(["Alpha", "Beta"]);

      await userEvent.selectOptions(screen.getByRole("combobox", { name: "Sort by" }), "created");

      await waitFor(() => expect(cardNames()).toEqual(["Beta", "Alpha"]));
    });

    it("shows the cards in a single column in the list view", async () => {
      mockProjects([alpha, beta]);
      renderApp("/projects?view=list");
      await screen.findByRole("link", { name: "Alpha" });

      expect(screen.getAllByRole("article")[0]?.parentElement).toHaveClass("grid-cols-1");
      expect(screen.getAllByRole("article")[0]?.parentElement).not.toHaveClass("md:grid-cols-2");
    });
  });

  describe("filters sent to the backend", () => {
    it("asks for active projects of any status by default", async () => {
      renderApp("/projects");
      await screen.findByRole("heading", { name: "No projects yet" });

      expect(listProjects).toHaveBeenCalledWith({ scope: "active", status: null, search: null });
    });

    it("sends the scope, status and search from the URL", async () => {
      renderApp("/projects?scope=archived&status=completed&q=app");
      await screen.findByRole("heading", { name: "No projects found" });

      expect(listProjects).toHaveBeenCalledWith({
        scope: "archived",
        status: "completed",
        search: "app",
      });
    });

    it("asks again when the status filter changes", async () => {
      renderApp("/projects");
      await screen.findByRole("heading", { name: "No projects yet" });

      await userEvent.click(screen.getByRole("radio", { name: "Paused" }));

      await waitFor(() =>
        expect(listProjects).toHaveBeenLastCalledWith({
          scope: "active",
          status: "paused",
          search: null,
        }),
      );
    });

    it("waits for a pause in typing before searching", async () => {
      renderApp("/projects");
      await screen.findByRole("heading", { name: "No projects yet" });
      listProjects.mockClear();

      await userEvent.type(screen.getByRole("searchbox"), "app");

      expect(listProjects).not.toHaveBeenCalledWith(expect.objectContaining({ search: "a" }));
      await waitFor(() =>
        expect(listProjects).toHaveBeenLastCalledWith({
          scope: "active",
          status: null,
          search: "app",
        }),
      );
      expect(listProjects).toHaveBeenCalledTimes(1);
    });
  });

  describe("creating", () => {
    it("opens the form from the header button and lists the new project afterwards", async () => {
      renderApp("/projects");
      await screen.findByRole("heading", { name: "No projects yet" });
      createProject.mockResolvedValue({ status: "ok", data: alpha });

      await userEvent.click(screen.getByRole("button", { name: "New project" }));
      await userEvent.type(await screen.findByRole("textbox", { name: "Project name" }), "Alpha");
      mockProjects([alpha]);
      await userEvent.click(screen.getByRole("button", { name: "Create project" }));

      expect(await screen.findByRole("link", { name: "Alpha" })).toBeInTheDocument();
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(createProject).toHaveBeenCalledWith({
        name: "Alpha",
        description: "",
        color: "orbit",
      });
    });

    it("opens the same form from the empty state", async () => {
      renderApp("/projects");

      await userEvent.click(await screen.findByRole("button", { name: "Create project" }));

      expect(await screen.findByRole("dialog", { name: "New project" })).toBeInTheDocument();
    });

    it("closes the form without creating anything", async () => {
      renderApp("/projects");
      await userEvent.click(await screen.findByRole("button", { name: "New project" }));

      await userEvent.click(await screen.findByRole("button", { name: "Cancel" }));

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(createProject).not.toHaveBeenCalled();
    });
  });

  describe("editing", () => {
    it("opens the form with the project and saves the change", async () => {
      mockProjects([alpha]);
      updateProject.mockResolvedValue({ status: "ok", data: { ...alpha, name: "Alpha 2" } });
      renderApp("/projects");
      await userEvent.click(await screen.findByRole("button", { name: "Project actions: Alpha" }));
      await userEvent.click(await screen.findByRole("menuitem", { name: "Edit project" }));

      const nameField = await screen.findByRole("textbox", { name: "Project name" });
      expect(nameField).toHaveValue("Alpha");
      await userEvent.type(nameField, " 2");
      mockProjects([{ ...alpha, name: "Alpha 2" }]);
      await userEvent.click(screen.getByRole("button", { name: "Save changes" }));

      expect(await screen.findByRole("link", { name: "Alpha 2" })).toBeInTheDocument();
      expect(updateProject).toHaveBeenCalledWith(
        "a",
        expect.objectContaining({ name: "Alpha 2", status: "active" }),
      );
    });
  });

  describe("archiving, restoring and deleting", () => {
    async function openMenuOf(name: string, item: string) {
      await userEvent.click(
        await screen.findByRole("button", { name: `Project actions: ${name}` }),
      );
      await userEvent.click(await screen.findByRole("menuitem", { name: item }));
    }

    it("archives after confirming and removes the project from the list", async () => {
      mockProjects([alpha]);
      archiveProject.mockResolvedValue({ status: "ok", data: alpha });
      renderApp("/projects");
      await openMenuOf("Alpha", "Archive");

      mockProjects([]);
      await userEvent.click(await screen.findByRole("button", { name: "Archive" }));

      expect(await screen.findByRole("heading", { name: "No projects yet" })).toBeInTheDocument();
      expect(archiveProject).toHaveBeenCalledWith("a");
    });

    it("does not archive when the confirmation is cancelled", async () => {
      mockProjects([alpha]);
      renderApp("/projects");
      await openMenuOf("Alpha", "Archive");

      await userEvent.click(await screen.findByRole("button", { name: "Cancel" }));

      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
      expect(archiveProject).not.toHaveBeenCalled();
      expect(screen.getByRole("link", { name: "Alpha" })).toBeInTheDocument();
    });

    it("restores an archived project after confirming", async () => {
      const archived = { ...alpha, archivedAt: "2026-05-01T00:00:00Z" };
      mockProjects([archived]);
      restoreProject.mockResolvedValue({ status: "ok", data: alpha });
      renderApp("/projects?scope=archived");
      await openMenuOf("Alpha", "Restore");

      mockProjects([]);
      await userEvent.click(await screen.findByRole("button", { name: "Restore" }));

      expect(
        await screen.findByRole("heading", { name: "No archived projects" }),
      ).toBeInTheDocument();
      expect(restoreProject).toHaveBeenCalledWith("a");
    });

    it("deletes only after typing the project name", async () => {
      mockProjects([alpha]);
      deleteProject.mockResolvedValue({ status: "ok", data: null });
      renderApp("/projects");
      await openMenuOf("Alpha", "Delete…");
      const confirm = await screen.findByRole("button", { name: "Delete" });
      expect(confirm).toBeDisabled();

      await userEvent.type(screen.getByRole("textbox"), "Alpha");
      mockProjects([]);
      await userEvent.click(confirm);

      expect(await screen.findByRole("heading", { name: "No projects yet" })).toBeInTheDocument();
      expect(deleteProject).toHaveBeenCalledWith("a");
    });
  });

  it("follows the language saved in the settings", async () => {
    vi.mocked(commands.getSettings).mockResolvedValueOnce({
      status: "ok",
      data: { language: "pt-BR", vaultPath: "/vault", userName: "Gabriel" },
    });
    renderApp("/projects");

    expect(
      await screen.findByRole("heading", { name: "Nenhum projeto ainda" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Pausados" })).toBeInTheDocument();
  });
});
