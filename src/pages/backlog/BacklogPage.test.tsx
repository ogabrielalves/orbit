import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { type BacklogItem, commands } from "@/bindings";
import { i18next } from "@/i18n";
import { renderApp } from "@/test/renderApp";
import { createTaskFixture } from "@/test/taskFixture";

const listBacklog = vi.mocked(commands.listBacklog);
const listBacklogByProject = vi.mocked(commands.listBacklogByProject);
const getTask = vi.mocked(commands.getTask);

function item(id: string, title: string, overrides: Partial<BacklogItem> = {}): BacklogItem {
  return {
    task: createTaskFixture({ id, title, boardId: null, columnId: null }),
    projectName: "ORBIT",
    tags: [],
    subtaskCount: 0,
    subtasksDone: 0,
    checklistCount: 0,
    checklistDone: 0,
    ...overrides,
  };
}

describe("BacklogPage", () => {
  beforeEach(async () => {
    await i18next.changeLanguage("en");
    listBacklog.mockReset();
    listBacklogByProject.mockReset();
    getTask.mockReset();
    listBacklog.mockResolvedValue({ status: "ok", data: [] });
    listBacklogByProject.mockResolvedValue({ status: "ok", data: [] });
  });

  it("shows the empty state when there is nothing in the backlog", async () => {
    renderApp("/backlog");

    expect(await screen.findByText("The backlog is empty")).toBeInTheDocument();
  });

  it("lists the tasks with project, progress and tags", async () => {
    listBacklog.mockResolvedValue({
      status: "ok",
      data: [
        item("t1", "Write the spec", {
          subtaskCount: 3,
          subtasksDone: 1,
          checklistCount: 2,
          checklistDone: 2,
          tags: [
            {
              id: "g1",
              name: "design",
              color: null,
              createdAt: "x",
              updatedAt: "x",
              taskCount: 1,
            },
          ],
        }),
        item("t2", "Fix the bug"),
      ],
    });
    renderApp("/backlog");

    const list = await screen.findByRole("list", { name: "Backlog tasks" });

    expect(within(list).getByText("Write the spec")).toBeInTheDocument();
    expect(within(list).getByText("Fix the bug")).toBeInTheDocument();
    expect(within(list).getByText("1/3 subtasks")).toBeInTheDocument();
    expect(within(list).getByText("2/2 checklist")).toBeInTheDocument();
    expect(within(list).getByText("design")).toBeInTheDocument();
    expect(await screen.findByText("2 tasks")).toBeInTheDocument();
  });

  it("sends the chosen filters to the backend", async () => {
    renderApp("/backlog?priority=high&sort=title");

    await waitFor(() =>
      expect(listBacklog).toHaveBeenCalledWith({
        projectId: null,
        priority: "high",
        tagId: null,
        search: null,
        sort: "title",
      }),
    );
  });

  it("changes the priority filter from the toolbar", async () => {
    renderApp("/backlog");
    await screen.findByText("The backlog is empty");

    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Priority" }), "urgent");

    await waitFor(() =>
      expect(listBacklog).toHaveBeenLastCalledWith(expect.objectContaining({ priority: "urgent" })),
    );
  });

  it("offers to clear the filters when nothing matches", async () => {
    renderApp("/backlog?priority=low");

    expect(await screen.findByText("No tasks found")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Clear filters" }));

    expect(await screen.findByText("The backlog is empty")).toBeInTheDocument();
  });

  it("groups the tasks by project", async () => {
    listBacklogByProject.mockResolvedValue({
      status: "ok",
      data: [
        { projectId: "p1", projectName: "ORBIT", items: [item("t1", "Write the spec")] },
        { projectId: "p2", projectName: "Fintech", items: [item("t2", "Fix the bug")] },
      ],
    });
    renderApp("/backlog");
    await screen.findByText("The backlog is empty");

    await userEvent.click(screen.getByRole("radio", { name: "By project" }));

    const orbit = await screen.findByRole("region", { name: "ORBIT" });
    expect(within(orbit).getByText("Write the spec")).toBeInTheDocument();
    const fintech = screen.getByRole("region", { name: "Fintech" });
    expect(within(fintech).getByText("Fix the bug")).toBeInTheDocument();
    expect(await screen.findByText("2 tasks")).toBeInTheDocument();
  });

  it("shows the translated error and retries", async () => {
    listBacklog.mockResolvedValueOnce({
      status: "error",
      error: { code: "DATABASE", message: "x" },
    });
    renderApp("/backlog");

    expect(await screen.findByText("Could not load the backlog")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByText("The backlog is empty")).toBeInTheDocument();
  });

  it("opens the task drawer when a task is clicked", async () => {
    const backlogItem = item("t1", "Write the spec");
    listBacklog.mockResolvedValue({ status: "ok", data: [backlogItem] });
    getTask.mockResolvedValue({ status: "ok", data: backlogItem.task });
    renderApp("/backlog");

    await userEvent.click(await screen.findByRole("button", { name: "Write the spec" }));

    expect(await screen.findByRole("textbox", { name: "Title" })).toHaveValue("Write the spec");
    expect(getTask).toHaveBeenCalledWith("t1");
  });
});
