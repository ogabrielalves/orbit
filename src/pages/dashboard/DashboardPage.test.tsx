import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type ActivityEntry,
  commands,
  type DashboardSummary,
  type Project,
  type UpcomingTask,
} from "@/bindings";
import { i18next } from "@/i18n";
import { createProjectFixture } from "@/test/projectFixture";
import { renderApp } from "@/test/renderApp";

const listProjects = vi.mocked(commands.listProjects);
const listRecentActivity = vi.mocked(commands.listRecentActivity);
const getDashboardSummary = vi.mocked(commands.getDashboardSummary);

function createEntry(overrides: Partial<ActivityEntry> = {}): ActivityEntry {
  return {
    id: "a1",
    entityType: "project",
    entityId: "p1",
    action: "created",
    changes: { name: { from: null, to: "Website 2.0" } },
    createdAt: "2026-11-08T12:00:00Z",
    ...overrides,
  };
}

function createSummary(overrides: Partial<DashboardSummary> = {}): DashboardSummary {
  return {
    tasks: { total: 0, backlog: 0, pending: 0, inProgress: 0, completed: 0 },
    activeProjectCount: 0,
    overdueTaskCount: 0,
    upcomingTasks: [],
    ...overrides,
  };
}

function createUpcoming(overrides: Partial<UpcomingTask> = {}): UpcomingTask {
  return {
    taskId: "t1",
    title: "Write the spec",
    dueDate: "2026-11-09",
    priority: "high",
    projectId: "p1",
    projectName: "Website 2.0",
    boardId: "b1",
    columnId: "c1",
    ...overrides,
  };
}

function mockSummary(summary: DashboardSummary) {
  getDashboardSummary.mockResolvedValue({ status: "ok", data: summary });
}

function mockProjects(projects: Project[]) {
  listProjects.mockResolvedValue({ status: "ok", data: projects });
}

function mockActivity(entries: ActivityEntry[]) {
  listRecentActivity.mockResolvedValue({ status: "ok", data: entries });
}

async function findCard(title: string): Promise<HTMLElement> {
  const heading = await screen.findByRole("heading", { level: 2, name: title });
  return heading.closest("section") as HTMLElement;
}

describe("DashboardPage", () => {
  beforeEach(async () => {
    await i18next.changeLanguage("en");
    listProjects.mockReset();
    listRecentActivity.mockReset();
    getDashboardSummary.mockReset();
    mockProjects([]);
    mockActivity([]);
    mockSummary(createSummary());
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("greeting", () => {
    it.each([
      [6, "Good morning"],
      [14, "Good afternoon"],
      [21, "Good evening"],
    ])("greets at %i:00 with %s", async (hour, greeting) => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date(2026, 10, 8, hour, 0));

      renderApp("/");

      expect(await screen.findByRole("heading", { level: 1, name: greeting })).toBeInTheDocument();
    });

    it("shows the greeting with the display title size", async () => {
      renderApp("/");

      const heading = await screen.findByRole("heading", { level: 1 });

      expect(heading).toHaveClass("text-title");
    });
  });

  describe("active projects", () => {
    it("asks only for active projects that are not archived", async () => {
      renderApp("/");
      await findCard("Active projects");

      expect(listProjects).toHaveBeenCalledWith({
        scope: "active",
        status: "active",
        search: null,
      });
    });

    it("shows a loading placeholder while they load", async () => {
      listProjects.mockReturnValue(new Promise(() => undefined));
      renderApp("/");

      const card = await findCard("Active projects");

      expect(within(card).getByRole("status")).toHaveTextContent("Loading…");
    });

    it("shows an empty state without a button that does nothing", async () => {
      renderApp("/");

      const card = await findCard("Active projects");

      expect(await within(card).findByText("No active projects")).toBeInTheDocument();
      expect(within(card).queryByRole("button")).not.toBeInTheDocument();
    });

    it("lists the most recently updated projects as links", async () => {
      mockProjects([
        createProjectFixture({ id: "old", name: "Old", updatedAt: "2026-01-01T12:00:00Z" }),
        createProjectFixture({ id: "new", name: "New", updatedAt: "2026-11-01T12:00:00Z" }),
      ]);
      renderApp("/");

      const card = await findCard("Active projects");
      const links = await within(card).findAllByRole("link", { name: /Old|New/ });

      expect(links.map((link) => link.textContent)).toEqual([
        expect.stringContaining("New"),
        expect.stringContaining("Old"),
      ]);
      expect(links[0]).toHaveAttribute("href", "/projects/new");
    });

    it("shows at most five projects", async () => {
      mockProjects(
        Array.from({ length: 8 }, (_, index) =>
          createProjectFixture({
            id: `p${index}`,
            name: `Project ${index}`,
            updatedAt: `2026-11-0${index + 1}T12:00:00Z`,
          }),
        ),
      );
      renderApp("/");

      const card = await findCard("Active projects");
      await within(card).findByRole("link", { name: /Project 7/ });

      expect(within(card).getAllByRole("listitem")).toHaveLength(5);
    });

    it("links to the full list of projects", async () => {
      renderApp("/");

      const card = await findCard("Active projects");

      expect(within(card).getByRole("link", { name: "All" })).toHaveAttribute("href", "/projects");
    });

    it("explains a loading failure and retries", async () => {
      listProjects.mockResolvedValueOnce({
        status: "error",
        error: { code: "DATABASE", message: "x" },
      });
      mockProjects([createProjectFixture({ id: "p1", name: "Fintech" })]);
      renderApp("/");

      const card = await findCard("Active projects");
      const alert = await within(card).findByRole("alert");
      expect(alert).toHaveTextContent("Could not load the projects");
      expect(alert).toHaveTextContent("Could not access the application data.");
      await userEvent.click(within(alert).getByRole("button", { name: "Try again" }));

      expect(await within(card).findByRole("link", { name: /Fintech/ })).toBeInTheDocument();
    });
  });

  describe("new project", () => {
    it("creates a project from the header button and refreshes the dashboard", async () => {
      const created = createProjectFixture({ id: "new", name: "Alpha" });
      vi.mocked(commands.createProject).mockResolvedValue({ status: "ok", data: created });
      renderApp("/");
      await findCard("Active projects");

      await userEvent.click(screen.getByRole("button", { name: "New project" }));
      await userEvent.type(await screen.findByRole("textbox", { name: "Project name" }), "Alpha");
      mockProjects([created]);
      mockSummary(createSummary({ activeProjectCount: 1 }));
      await userEvent.click(screen.getByRole("button", { name: "Create project" }));

      expect(await screen.findByRole("link", { name: /Alpha/ })).toBeInTheDocument();
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(commands.createProject).toHaveBeenCalledWith({
        name: "Alpha",
        description: "",
        color: "orbit",
      });
      expect(getDashboardSummary).toHaveBeenCalledTimes(2);
    });

    it("closes the form without creating anything", async () => {
      vi.mocked(commands.createProject).mockReset();
      renderApp("/");
      await userEvent.click(await screen.findByRole("button", { name: "New project" }));

      await userEvent.click(await screen.findByRole("button", { name: "Cancel" }));

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(commands.createProject).not.toHaveBeenCalled();
    });
  });

  describe("summary strip", () => {
    it("asks for the summary with the local date", async () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date(2026, 10, 8, 23, 30));

      renderApp("/");
      await findCard("Active projects");

      expect(getDashboardSummary).toHaveBeenCalledWith({ today: "2026-11-08" });
    });

    it("shows the counters", async () => {
      mockSummary(
        createSummary({
          activeProjectCount: 4,
          overdueTaskCount: 2,
          tasks: { total: 12, backlog: 3, pending: 2, inProgress: 5, completed: 2 },
        }),
      );
      renderApp("/");

      const todo = await screen.findByText("To do");

      expect(todo.nextElementSibling).toHaveTextContent("5");
      expect(screen.getByText("In progress").nextElementSibling).toHaveTextContent("5");
      expect(screen.getByText("Completed").nextElementSibling).toHaveTextContent("2");
      expect(screen.getByText("Overdue").nextElementSibling).toHaveTextContent("2");
      expect(screen.getAllByText("Active projects")[0]?.closest("div")).toHaveTextContent("4");
    });

    it("offers a retry when the summary fails", async () => {
      getDashboardSummary.mockResolvedValueOnce({
        status: "error",
        error: { code: "DATABASE", message: "x" },
      });
      renderApp("/");

      expect(await screen.findByText("Could not load the summary")).toBeInTheDocument();
      await userEvent.click(screen.getAllByRole("button", { name: "Try again" })[0] as HTMLElement);

      expect(await screen.findByText("Overdue")).toBeInTheDocument();
    });
  });

  describe("upcoming deadlines", () => {
    it("shows an empty state when nothing is due", async () => {
      renderApp("/");

      const card = await findCard("Upcoming deadlines");

      expect(await within(card).findByText("Nothing due soon")).toBeInTheDocument();
    });

    it("lists the tasks with project, priority and due date", async () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date(2026, 10, 8, 10, 0));
      mockSummary(createSummary({ upcomingTasks: [createUpcoming()] }));
      renderApp("/");

      const card = await findCard("Upcoming deadlines");
      const link = await within(card).findByRole("link", { name: /Write the spec/ });

      expect(link).toHaveAttribute("href", "/boards/b1");
      expect(link).toHaveTextContent("Website 2.0");
      expect(link).toHaveTextContent("High");
      expect(link).toHaveTextContent("Tomorrow");
    });

    it("links to the project when the task has no board", async () => {
      mockSummary(
        createSummary({ upcomingTasks: [createUpcoming({ boardId: null, columnId: null })] }),
      );
      renderApp("/");

      const card = await findCard("Upcoming deadlines");

      expect(await within(card).findByRole("link", { name: /Write the spec/ })).toHaveAttribute(
        "href",
        "/projects/p1",
      );
    });

    it("shows an error with retry when the summary fails", async () => {
      getDashboardSummary.mockResolvedValue({
        status: "error",
        error: { code: "DATABASE", message: "x" },
      });
      renderApp("/");

      const card = await findCard("Upcoming deadlines");

      expect(await within(card).findByText("Could not load the deadlines")).toBeInTheDocument();
    });
  });

  describe("recent activity", () => {
    it("asks for the ten latest entries", async () => {
      renderApp("/");
      await findCard("Recent activity");

      expect(listRecentActivity).toHaveBeenCalledWith(10);
    });

    it("shows a loading placeholder while it loads", async () => {
      listRecentActivity.mockReturnValue(new Promise(() => undefined));
      renderApp("/");

      const card = await findCard("Recent activity");

      expect(within(card).getByRole("status")).toHaveTextContent("Loading…");
    });

    it("shows an empty state when nothing happened yet", async () => {
      renderApp("/");

      const card = await findCard("Recent activity");

      expect(await within(card).findByText("No activity yet")).toBeInTheDocument();
    });

    it("describes each entry without naming an author", async () => {
      mockActivity([
        createEntry({ id: "1" }),
        createEntry({
          id: "2",
          entityType: "task",
          entityId: "t1",
          action: "completed",
          changes: null,
        }),
      ]);
      renderApp("/");

      const card = await findCard("Recent activity");

      expect(await within(card).findByText("Project “Website 2.0” created")).toBeInTheDocument();
      expect(within(card).getByText("Task completed")).toBeInTheDocument();
      expect(within(card).queryByText(/you/i)).not.toBeInTheDocument();
    });

    it("shows how long ago each entry happened", async () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date("2026-11-08T12:12:00Z"));
      mockActivity([createEntry()]);
      renderApp("/");

      const card = await findCard("Recent activity");

      expect(await within(card).findByText("12 minutes ago")).toBeInTheDocument();
    });

    it("links an entry of an existing project to it", async () => {
      mockActivity([createEntry({ entityId: "p9", action: "updated" })]);
      renderApp("/");

      const card = await findCard("Recent activity");

      expect(
        await within(card).findByRole("link", { name: /Project “Website 2.0” updated/ }),
      ).toHaveAttribute("href", "/projects/p9");
    });

    it("does not link an entry of a project that was deleted, but still shows its name", async () => {
      mockActivity([
        createEntry({
          action: "deleted",
          changes: { name: { from: "Old project", to: null } },
        }),
      ]);
      renderApp("/");

      const card = await findCard("Recent activity");

      expect(await within(card).findByText("Project “Old project” deleted")).toBeInTheDocument();
      expect(within(card).queryByRole("link")).not.toBeInTheDocument();
    });

    it("does not link entries that have no destination yet", async () => {
      mockActivity([createEntry({ entityType: "board", action: "created", changes: null })]);
      renderApp("/");

      const card = await findCard("Recent activity");

      expect(await within(card).findByText("Board created")).toBeInTheDocument();
      expect(within(card).queryByRole("link")).not.toBeInTheDocument();
    });

    it("keeps the order the backend returned, newest first", async () => {
      mockActivity([
        createEntry({ id: "1", action: "archived", changes: null }),
        createEntry({ id: "2", action: "created", changes: null }),
      ]);
      renderApp("/");

      const card = await findCard("Recent activity");
      const items = await within(card).findAllByRole("listitem");

      expect(items[0]).toHaveTextContent("Project archived");
      expect(items[1]).toHaveTextContent("Project created");
    });

    it("explains a loading failure with a translated message and retries", async () => {
      listRecentActivity.mockResolvedValueOnce({
        status: "error",
        error: { code: "INTERNAL", message: "panic" },
      });
      mockActivity([createEntry()]);
      renderApp("/");

      const card = await findCard("Recent activity");
      const alert = await within(card).findByRole("alert");
      expect(alert).toHaveTextContent("Could not load the activity");
      expect(alert).toHaveTextContent("An internal error occurred. Please try again.");
      expect(alert).not.toHaveTextContent("panic");
      await userEvent.click(within(alert).getByRole("button", { name: "Try again" }));

      expect(await within(card).findByText("Project “Website 2.0” created")).toBeInTheDocument();
    });
  });

  it("offers no actions for features that do not exist yet", async () => {
    renderApp("/");
    await findCard("Active projects");

    expect(
      screen.queryByRole("button", { name: /new task|new board|new note/i }),
    ).not.toBeInTheDocument();
  });

  it("follows the language saved in the settings", async () => {
    vi.mocked(commands.getSettings).mockResolvedValueOnce({
      status: "ok",
      data: { language: "pt-BR", vaultPath: null },
    });
    mockActivity([createEntry({ entityType: "task", action: "completed", changes: null })]);
    renderApp("/");

    expect(
      await screen.findByRole("heading", { level: 2, name: "Projetos ativos" }),
    ).toBeInTheDocument();
    expect(await screen.findByText("Tarefa concluída")).toBeInTheDocument();
  });
});
