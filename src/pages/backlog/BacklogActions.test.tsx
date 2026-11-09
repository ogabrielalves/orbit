import type { DndContextProps } from "@dnd-kit/core";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { act } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { type BacklogItem, commands } from "@/bindings";
import { i18next } from "@/i18n";
import { createBoardDetailsFixture } from "@/test/boardFixture";
import { createProjectFixture } from "@/test/projectFixture";
import { renderApp } from "@/test/renderApp";
import { createTaskFixture } from "@/test/taskFixture";

const dnd = vi.hoisted(() => ({ props: null as DndContextProps | null }));

vi.mock("@dnd-kit/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@dnd-kit/core")>();
  const { createElement } = await import("react");
  return {
    ...actual,
    DndContext: (props: DndContextProps) => {
      dnd.props = props;
      return createElement(actual.DndContext, props);
    },
  };
});

const listBacklog = vi.mocked(commands.listBacklog);
const listBacklogByProject = vi.mocked(commands.listBacklogByProject);
const moveBacklogTask = vi.mocked(commands.moveBacklogTask);
const getProject = vi.mocked(commands.getProject);
const getBoard = vi.mocked(commands.getBoard);
const sendTaskToBoard = vi.mocked(commands.sendTaskToBoard);

function item(id: string, title: string, projectId = "p1"): BacklogItem {
  return {
    task: createTaskFixture({ id, title, projectId, boardId: null, columnId: null }),
    projectName: projectId === "p1" ? "ORBIT" : "Fintech",
    tags: [],
    subtaskCount: 0,
    subtasksDone: 0,
    checklistCount: 0,
    checklistDone: 0,
  };
}

const items = [item("t1", "First"), item("t2", "Second"), item("t3", "Third")];

async function drop(activeId: string, overId: string) {
  await act(async () => {
    dnd.props?.onDragEnd?.({ active: { id: activeId }, over: { id: overId } } as never);
  });
}

function titles(): string[] {
  const list = screen.getByRole("list", { name: "Backlog tasks" });
  return within(list)
    .getAllByRole("button", { name: /^(First|Second|Third)$/ })
    .map((button) => button.textContent ?? "");
}

describe("Backlog reordering", () => {
  beforeEach(async () => {
    await i18next.changeLanguage("en");
    dnd.props = null;
    for (const command of [listBacklog, listBacklogByProject, moveBacklogTask]) {
      command.mockReset();
    }
    listBacklog.mockResolvedValue({ status: "ok", data: items });
    listBacklogByProject.mockResolvedValue({ status: "ok", data: [] });
  });

  it("moves a task after the one it was dropped on", async () => {
    moveBacklogTask.mockResolvedValue({ status: "ok", data: items[0]?.task as never });
    renderApp("/backlog");
    await screen.findByRole("list", { name: "Backlog tasks" });

    listBacklog.mockResolvedValue({ status: "ok", data: [items[1], items[2], items[0]] as never });
    await drop("t1", "t3");

    await waitFor(() => expect(moveBacklogTask).toHaveBeenCalledWith("t1", "t3"));
    expect(titles()).toEqual(["Second", "Third", "First"]);
  });

  it("moves a task to the top of its project with a null anchor", async () => {
    moveBacklogTask.mockResolvedValue({ status: "ok", data: items[2]?.task as never });
    renderApp("/backlog");
    await screen.findByRole("list", { name: "Backlog tasks" });

    await drop("t3", "t1");

    await waitFor(() => expect(moveBacklogTask).toHaveBeenCalledWith("t3", null));
  });

  it("restores the order when the backend refuses the move", async () => {
    moveBacklogTask.mockResolvedValue({
      status: "error",
      error: { code: "DATABASE", message: "x" },
    });
    renderApp("/backlog");
    await screen.findByRole("list", { name: "Backlog tasks" });

    await drop("t1", "t3");

    await waitFor(() => expect(moveBacklogTask).toHaveBeenCalled());
    await waitFor(() => expect(titles()).toEqual(["First", "Second", "Third"]));
  });

  it("explains the drag in the manual order", async () => {
    renderApp("/backlog");

    expect(
      await screen.findByText("Drag the tasks to reorder them inside each project."),
    ).toBeInTheDocument();
    expect(dnd.props).not.toBeNull();
  });

  it("does not allow dragging when the order is not manual", async () => {
    renderApp("/backlog?sort=title");
    await screen.findByRole("list", { name: "Backlog tasks" });

    expect(dnd.props).toBeNull();
    expect(
      screen.queryByText("Drag the tasks to reorder them inside each project."),
    ).not.toBeInTheDocument();
  });

  it("does not allow dragging when grouped by project", async () => {
    listBacklogByProject.mockResolvedValue({
      status: "ok",
      data: [{ projectId: "p1", projectName: "ORBIT", items }],
    });
    renderApp("/backlog?grouped=true");
    await screen.findByRole("region", { name: "ORBIT" });

    expect(dnd.props).toBeNull();
  });
});

describe("Backlog send to board", () => {
  beforeEach(async () => {
    await i18next.changeLanguage("en");
    for (const command of [listBacklog, getProject, getBoard, sendTaskToBoard]) {
      command.mockReset();
    }
    listBacklog.mockResolvedValue({ status: "ok", data: items });
    getProject.mockResolvedValue({
      status: "ok",
      data: {
        project: createProjectFixture({ id: "p1" }),
        boards: [
          { id: "b1", name: "Sprint 14", createdAt: "2026-11-01T10:00:00Z", taskCount: 0 },
          { id: "b2", name: "Kanban", createdAt: "2026-11-02T10:00:00Z", taskCount: 0 },
        ],
        taskCount: 3,
        backlogTaskCount: 3,
      },
    });
    getBoard.mockResolvedValue({ status: "ok", data: createBoardDetailsFixture() });
  });

  async function openModal() {
    renderApp("/backlog");
    await userEvent.click(await screen.findByRole("button", { name: "Send First to a board" }));
    return screen.findByRole("dialog", { name: "Send “First” to a board" });
  }

  it("sends the task to the first column of the first board by default", async () => {
    sendTaskToBoard.mockResolvedValue({ status: "ok", data: items[0]?.task as never });
    const dialog = await openModal();
    await within(dialog).findByRole("option", { name: "To do" });

    await userEvent.click(within(dialog).getByRole("button", { name: "Send" }));

    await waitFor(() => expect(sendTaskToBoard).toHaveBeenCalledWith("t1", "b1", "c1"));
    expect(await screen.findByText("Task sent to “Sprint 14”")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("lets the user pick another board and column", async () => {
    sendTaskToBoard.mockResolvedValue({ status: "ok", data: items[0]?.task as never });
    const dialog = await openModal();
    await within(dialog).findByRole("option", { name: "To do" });

    await userEvent.selectOptions(within(dialog).getByRole("combobox", { name: "Board" }), "b2");
    await userEvent.selectOptions(within(dialog).getByRole("combobox", { name: "Column" }), "c3");
    await userEvent.click(within(dialog).getByRole("button", { name: "Send" }));

    await waitFor(() => expect(sendTaskToBoard).toHaveBeenCalledWith("t1", "b2", "c3"));
    expect(getBoard).toHaveBeenCalledWith("b2");
  });

  it("explains when the project has no boards", async () => {
    getProject.mockResolvedValue({
      status: "ok",
      data: {
        project: createProjectFixture({ id: "p1" }),
        boards: [],
        taskCount: 0,
        backlogTaskCount: 3,
      },
    });
    const dialog = await openModal();

    expect(
      await within(dialog).findByText("This project has no boards yet. Create one first."),
    ).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Send" })).toBeDisabled();
  });

  it("closes without sending when cancelled", async () => {
    const dialog = await openModal();

    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(sendTaskToBoard).not.toHaveBeenCalled();
  });
});
