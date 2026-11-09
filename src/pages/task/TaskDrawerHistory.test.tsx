import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { type ActivityEntry, commands } from "@/bindings";
import { i18next } from "@/i18n";
import { createBoardDetailsFixture } from "@/test/boardFixture";
import { renderApp } from "@/test/renderApp";
import { createTaskFixture } from "@/test/taskFixture";

const getBoard = vi.mocked(commands.getBoard);
const listBoardTasks = vi.mocked(commands.listBoardTasks);
const getTask = vi.mocked(commands.getTask);
const getTaskHistory = vi.mocked(commands.getTaskHistory);

const task = createTaskFixture({ id: "t1", title: "Write the spec" });

function entry(overrides: Partial<ActivityEntry>): ActivityEntry {
  return {
    id: "a1",
    entityType: "task",
    entityId: "t1",
    action: "created",
    changes: null,
    createdAt: "2026-11-08T10:00:00Z",
    ...overrides,
  };
}

async function openHistory() {
  renderApp("/boards/b1?task=t1");
  await screen.findByRole("textbox", { name: "Title" });
  await userEvent.click(screen.getByRole("radio", { name: "History" }));
}

describe("TaskDrawer history", () => {
  beforeEach(async () => {
    await i18next.changeLanguage("en");
    for (const command of [getBoard, listBoardTasks, getTask, getTaskHistory]) {
      command.mockReset();
    }
    getBoard.mockResolvedValue({ status: "ok", data: createBoardDetailsFixture() });
    listBoardTasks.mockResolvedValue({ status: "ok", data: [task] });
    getTask.mockResolvedValue({ status: "ok", data: task });
    getTaskHistory.mockResolvedValue({ status: "ok", data: [] });
  });

  it("starts on the details tab without loading the history", async () => {
    renderApp("/boards/b1?task=t1");
    await screen.findByRole("textbox", { name: "Title" });

    expect(screen.getByRole("radio", { name: "Details" })).toBeChecked();
    expect(screen.getByRole("region", { name: "Checklist" })).toBeInTheDocument();
    expect(getTaskHistory).not.toHaveBeenCalled();
  });

  it("shows the empty state when the task has no history", async () => {
    await openHistory();

    expect(await screen.findByText("No history yet")).toBeInTheDocument();
    expect(getTaskHistory).toHaveBeenCalledWith("t1", null);
    expect(screen.queryByRole("region", { name: "Checklist" })).not.toBeInTheDocument();
  });

  it("lists the entries with the fields that changed", async () => {
    getTaskHistory.mockResolvedValue({
      status: "ok",
      data: [
        entry({
          id: "a2",
          action: "moved",
          changes: { column: { from: "Todo", to: "Doing" } },
        }),
        entry({
          id: "a1",
          action: "created",
          changes: { title: { from: null, to: "Write the spec" } },
        }),
      ],
    });
    await openHistory();

    const list = await screen.findByRole("list", { name: "History" });

    expect(list).toHaveTextContent("Task moved");
    expect(list).toHaveTextContent("Column: Todo → Doing");
    expect(list).toHaveTextContent("Title: Write the spec");
  });

  it("returns to the details tab", async () => {
    await openHistory();
    await userEvent.click(screen.getByRole("radio", { name: "Details" }));

    expect(await screen.findByRole("region", { name: "Checklist" })).toBeInTheDocument();
  });

  it("shows the translated error and retries", async () => {
    getTaskHistory.mockResolvedValueOnce({
      status: "error",
      error: { code: "DATABASE", message: "x" },
    });
    await openHistory();

    expect(await screen.findByText("Could not load the history")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByText("No history yet")).toBeInTheDocument();
  });
});
