import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { commands, type SearchHit, type SearchResults } from "@/bindings";
import { i18next } from "@/i18n";
import { createProjectFixture } from "@/test/projectFixture";
import { renderApp } from "@/test/renderApp";

const search = vi.mocked(commands.search);
const listProjects = vi.mocked(commands.listProjects);
const createTask = vi.mocked(commands.createTask);
const getProject = vi.mocked(commands.getProject);
const getVaultStatus = vi.mocked(commands.getVaultStatus);

const emptyResults: SearchResults = { projects: [], boards: [], tasks: [], notes: [], folders: [] };

function hit(entityId: string, title: string, overrides: Partial<SearchHit> = {}): SearchHit {
  return {
    entityId,
    title: [{ text: title, isMatch: false }],
    snippet: [],
    context: null,
    projectId: null,
    boardId: null,
    parentTaskId: null,
    path: null,
    ...overrides,
  };
}

function mockResults(results: Partial<SearchResults>) {
  search.mockResolvedValue({ status: "ok", data: { ...emptyResults, ...results } });
}

async function openPalette() {
  await userEvent.keyboard("{Control>}k{/Control}");
  return screen.findByRole("dialog", { name: "Global search" });
}

async function searchFor(text: string) {
  await openPalette();
  await userEvent.type(screen.getByRole("combobox"), text);
}

const website = createProjectFixture({ id: "p1", name: "Website 2.0" });
const mobile = createProjectFixture({ id: "p2", name: "Mobile app", color: "ember" });

describe("CommandPalette", () => {
  beforeEach(async () => {
    await i18next.changeLanguage("en");
    for (const command of [search, listProjects, createTask, getProject]) {
      command.mockReset();
    }
    listProjects.mockResolvedValue({ status: "ok", data: [website, mobile] });
    mockResults({});
    getVaultStatus.mockResolvedValue({
      status: "ok",
      data: { path: "C:\\notes", isAccessible: true },
    });
    vi.mocked(commands.listFolders).mockResolvedValue({ status: "ok", data: [] });
    vi.mocked(commands.listNotes).mockResolvedValue({ status: "ok", data: [] });
  });

  describe("opening", () => {
    it("opens with Ctrl+K and lists the quick actions", async () => {
      renderApp("/");

      const dialog = await openPalette();

      expect(within(dialog).getByRole("combobox")).toHaveFocus();
      const options = within(dialog).getAllByRole("option");
      expect(options.map((option) => option.textContent)).toEqual([
        "New task",
        "New project",
        "New board",
        "New note",
      ]);
      expect(search).not.toHaveBeenCalled();
    });

    it("opens from the top bar button", async () => {
      renderApp("/");

      await userEvent.click(await screen.findByRole("button", { name: /Search everything/ }));

      expect(await screen.findByRole("dialog", { name: "Global search" })).toBeInTheDocument();
    });

    it("closes with Escape and with Ctrl+K again", async () => {
      renderApp("/");
      await openPalette();

      await userEvent.keyboard("{Escape}");
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

      await openPalette();
      await userEvent.keyboard("{Control>}k{/Control}");
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    });
  });

  describe("search", () => {
    it("debounces the typing into a single search", async () => {
      mockResults({ projects: [hit("p1", "Website 2.0")] });
      renderApp("/");

      await searchFor("web");

      expect(await screen.findByRole("option", { name: "Website 2.0" })).toBeInTheDocument();
      expect(search).toHaveBeenCalledTimes(1);
      expect(search).toHaveBeenCalledWith({ query: "web" });
    });

    it("groups the results by category with a heading each", async () => {
      mockResults({
        projects: [hit("p1", "Plan project")],
        tasks: [hit("t1", "Plan sprint", { boardId: "b1" })],
        notes: [hit("n1", "Plan notes")],
      });
      renderApp("/");

      await searchFor("plan");

      expect(await screen.findByRole("group", { name: "Projects" })).toBeInTheDocument();
      expect(screen.getByRole("group", { name: "Tasks" })).toBeInTheDocument();
      expect(screen.getByRole("group", { name: "Notes" })).toBeInTheDocument();
      expect(screen.queryByRole("group", { name: "Boards" })).not.toBeInTheDocument();
      expect(
        within(screen.getByRole("group", { name: "Tasks" })).getAllByRole("option"),
      ).toHaveLength(1);
    });

    it("highlights the matching parts with mark elements", async () => {
      mockResults({
        notes: [
          hit("n1", "Weekly plan", {
            title: [
              { text: "Weekly ", isMatch: false },
              { text: "plan", isMatch: true },
            ],
            snippet: [
              { text: "the ", isMatch: false },
              { text: "plan", isMatch: true },
              { text: " for Monday", isMatch: false },
            ],
          }),
        ],
      });
      renderApp("/");

      await searchFor("plan");

      const option = await screen.findByRole("option");
      const marks = Array.from(option.querySelectorAll("mark")).map((mark) => mark.textContent);
      expect(marks).toEqual(["plan", "plan"]);
      expect(option).toHaveTextContent("the plan for Monday");
    });

    it("never turns markup in a result into elements", async () => {
      mockResults({
        notes: [
          hit("n1", "x", {
            title: [{ text: "<img src=x onerror=alert(1)>", isMatch: false }],
            snippet: [{ text: "<b>bold</b>", isMatch: true }],
          }),
        ],
      });
      renderApp("/");

      await searchFor("x");

      const option = await screen.findByRole("option", { name: /img src/ });
      expect(option.querySelector("img")).toBeNull();
      expect(option.querySelector("b")).toBeNull();
      expect(option).toHaveTextContent("<b>bold</b>");
    });

    it("shows the context of a result", async () => {
      mockResults({ tasks: [hit("t1", "Ship it", { boardId: "b1", context: "Website 2.0" })] });
      renderApp("/");

      await searchFor("ship");

      expect(await screen.findByRole("option", { name: /Ship it/ })).toHaveTextContent(
        "Website 2.0",
      );
    });

    it("tells when nothing matches", async () => {
      renderApp("/");

      await searchFor("zzz");

      expect(await screen.findByText("Nothing found for “zzz”")).toBeInTheDocument();
    });

    it("keeps the quick actions that match the typed text", async () => {
      renderApp("/");

      await searchFor("board");

      const options = await screen.findAllByRole("option");
      expect(options.map((option) => option.textContent)).toEqual(["New board"]);
    });

    it("shows the error when the search fails", async () => {
      search.mockResolvedValue({ status: "error", error: { code: "DATABASE", message: "x" } });
      renderApp("/");

      await searchFor("plan");

      expect(await screen.findByRole("alert")).toHaveTextContent(
        "Could not access the application data.",
      );
    });
  });

  describe("keyboard", () => {
    it("moves the active option with the arrows, wrapping around", async () => {
      renderApp("/");
      await openPalette();
      const input = screen.getByRole("combobox");
      const [first, second, , last] = screen.getAllByRole("option");

      expect(first).toHaveAttribute("aria-selected", "true");
      expect(input).toHaveAttribute("aria-activedescendant", first?.id);

      await userEvent.keyboard("{ArrowDown}");
      expect(second).toHaveAttribute("aria-selected", "true");
      expect(first).toHaveAttribute("aria-selected", "false");

      await userEvent.keyboard("{ArrowUp}{ArrowUp}");
      expect(last).toHaveAttribute("aria-selected", "true");

      await userEvent.keyboard("{ArrowDown}");
      expect(first).toHaveAttribute("aria-selected", "true");
    });

    it("opens the active result with Enter", async () => {
      mockResults({ projects: [hit("p9", "Plan project")], notes: [hit("n1", "Plan notes")] });
      getProject.mockResolvedValue({
        status: "ok",
        data: {
          project: createProjectFixture({ id: "p9" }),
          boards: [],
          taskCount: 0,
          backlogTaskCount: 0,
        },
      });
      const router = renderApp("/");
      await searchFor("plan");
      await screen.findByRole("option", { name: "Plan project" });

      await userEvent.keyboard("{Enter}");

      await waitFor(() => expect(router.state.location.pathname).toBe("/projects/p9"));
      await waitFor(() =>
        expect(screen.queryByRole("dialog", { name: "Global search" })).not.toBeInTheDocument(),
      );
    });

    it("selects an option by clicking it", async () => {
      mockResults({ folders: [hit("f1", "plans", { path: "work/plans" })] });
      const router = renderApp("/");
      await searchFor("plans");

      await userEvent.click(await screen.findByRole("option", { name: "plans" }));

      await waitFor(() => expect(router.state.location.pathname).toBe("/notes"));
      expect(router.state.location.search).toMatchObject({ folder: "work/plans" });
    });
  });

  describe("opening a result", () => {
    async function openFirstResult(results: Partial<SearchResults>, name: string | RegExp) {
      mockResults(results);
      const router = renderApp("/");
      await searchFor("x");
      await userEvent.click(await screen.findByRole("option", { name }));
      return router;
    }

    it("opens a board", async () => {
      const router = await openFirstResult({ boards: [hit("b7", "Sprint")] }, "Sprint");

      await waitFor(() => expect(router.state.location.pathname).toBe("/boards/b7"));
    });

    it("opens a board task in its drawer", async () => {
      const router = await openFirstResult(
        { tasks: [hit("t1", "Fix bug", { boardId: "b7" })] },
        /Fix bug/,
      );

      await waitFor(() => expect(router.state.location.pathname).toBe("/boards/b7"));
      expect(router.state.location.search).toMatchObject({ task: "t1" });
    });

    it("opens a backlog task in the backlog", async () => {
      const router = await openFirstResult({ tasks: [hit("t2", "Someday")] }, /Someday/);

      await waitFor(() => expect(router.state.location.pathname).toBe("/backlog"));
      expect(router.state.location.search).toMatchObject({ task: "t2" });
    });

    it("opens the parent task for a subtask", async () => {
      const router = await openFirstResult(
        { tasks: [hit("s1", "Sub step", { boardId: "b7", parentTaskId: "t1" })] },
        /Sub step/,
      );

      await waitFor(() => expect(router.state.location.pathname).toBe("/boards/b7"));
      expect(router.state.location.search).toMatchObject({ task: "t1" });
    });

    it("opens a note", async () => {
      const router = await openFirstResult({ notes: [hit("n3", "Ideas")] }, "Ideas");

      await waitFor(() => expect(router.state.location.pathname).toBe("/notes/n3"));
    });
  });

  describe("quick actions", () => {
    it("starts a new project on the projects page", async () => {
      const router = renderApp("/");
      await openPalette();

      await userEvent.click(screen.getByRole("option", { name: "New project" }));

      expect(await screen.findByRole("dialog", { name: "New project" })).toBeInTheDocument();
      expect(router.state.location.pathname).toBe("/projects");
      await waitFor(() => expect(router.state.location.search).not.toHaveProperty("new"));
    });

    it("starts a new note on the notes page", async () => {
      renderApp("/");
      await openPalette();

      await userEvent.click(screen.getByRole("option", { name: "New note" }));

      expect(await screen.findByRole("dialog", { name: "New note" })).toBeInTheDocument();
    });

    it("asks for an active project before creating a board", async () => {
      getProject.mockResolvedValue({
        status: "ok",
        data: { project: website, boards: [], taskCount: 0, backlogTaskCount: 0 },
      });
      const router = renderApp("/");
      await openPalette();

      await userEvent.click(screen.getByRole("option", { name: "New board" }));

      expect(await screen.findByText("Which project should get the board?")).toBeInTheDocument();
      expect(listProjects).toHaveBeenCalledWith({ scope: "active", status: null, search: null });
      expect(await screen.findByRole("option", { name: "Website 2.0" })).toBeInTheDocument();
      expect(screen.getByRole("option", { name: "Mobile app" })).toBeInTheDocument();
      expect(screen.getAllByRole("option")).toHaveLength(2);

      await userEvent.type(screen.getByRole("combobox"), "mob");
      expect(screen.getAllByRole("option")).toHaveLength(1);
      expect(screen.getByRole("option", { name: "Mobile app" })).toBeInTheDocument();

      await userEvent.clear(screen.getByRole("combobox"));
      await userEvent.click(screen.getByRole("option", { name: "Website 2.0" }));

      expect(await screen.findByRole("dialog", { name: "New board" })).toBeInTheDocument();
      expect(router.state.location.pathname).toBe("/projects/p1");
      await waitFor(() => expect(router.state.location.search).not.toHaveProperty("new"));
    });

    it("creates a task in the backlog of the chosen project and confirms with a toast", async () => {
      createTask.mockResolvedValue({
        status: "ok",
        data: { id: "t9", title: "Call the bank" } as never,
      });
      const router = renderApp("/");
      await openPalette();

      await userEvent.click(screen.getByRole("option", { name: "New task" }));
      await screen.findByText("Which project should get the task?");
      await userEvent.click(await screen.findByRole("option", { name: "Mobile app" }));

      expect(screen.getByText("Project: Mobile app")).toBeInTheDocument();
      await userEvent.type(screen.getByRole("textbox", { name: "Task title" }), "  Call the bank ");
      await userEvent.keyboard("{Enter}");

      await waitFor(() => expect(createTask).toHaveBeenCalledTimes(1));
      expect(createTask).toHaveBeenCalledWith({ projectId: "p2", title: "Call the bank" });
      expect(await screen.findByText("Task created in Mobile app")).toBeInTheDocument();
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      expect(router.state.location.pathname).toBe("/");
    });

    it("does not create a task with a blank title", async () => {
      renderApp("/");
      await openPalette();
      await userEvent.click(screen.getByRole("option", { name: "New task" }));
      await userEvent.click(await screen.findByRole("option", { name: "Website 2.0" }));

      await userEvent.type(screen.getByRole("textbox", { name: "Task title" }), "   {Enter}");

      expect(createTask).not.toHaveBeenCalled();
      expect(screen.getByRole("dialog", { name: "Global search" })).toBeInTheDocument();
    });

    it("tells when there is no active project", async () => {
      listProjects.mockResolvedValue({ status: "ok", data: [] });
      renderApp("/");
      await openPalette();

      await userEvent.click(screen.getByRole("option", { name: "New board" }));

      expect(await screen.findByText("No active project found")).toBeInTheDocument();
    });

    it("goes back one step with Escape and with Backspace on an empty field", async () => {
      renderApp("/");
      await openPalette();
      await userEvent.click(screen.getByRole("option", { name: "New task" }));
      await userEvent.click(await screen.findByRole("option", { name: "Website 2.0" }));
      expect(screen.getByRole("textbox", { name: "Task title" })).toBeInTheDocument();

      await userEvent.keyboard("{Escape}");
      expect(await screen.findByText("Which project should get the task?")).toBeInTheDocument();
      expect(screen.getByRole("dialog", { name: "Global search" })).toBeInTheDocument();

      await userEvent.keyboard("{Backspace}");
      expect(await screen.findByRole("option", { name: "New task" })).toBeInTheDocument();

      await userEvent.keyboard("{Escape}");
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    });
  });
});
