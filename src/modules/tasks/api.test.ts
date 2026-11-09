import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  archiveTask,
  createTask,
  deleteTask,
  fetchBoardTasks,
  fetchTask,
  moveTask,
  restoreTask,
  sendTaskToBacklog,
  sendTaskToBoard,
  updateTask,
} from "@/modules/tasks/api";
import { createTaskFixture } from "@/test/taskFixture";

const commands = vi.hoisted(() => ({
  listBoardTasks: vi.fn(),
  getTask: vi.fn(),
  createTask: vi.fn(),
  updateTask: vi.fn(),
  archiveTask: vi.fn(),
  restoreTask: vi.fn(),
  deleteTask: vi.fn(),
  moveTask: vi.fn(),
  sendTaskToBoard: vi.fn(),
  sendTaskToBacklog: vi.fn(),
}));

vi.mock("@/bindings", () => ({ commands }));

const task = createTaskFixture();

describe("tasks api", () => {
  beforeEach(() => {
    for (const command of Object.values(commands)) {
      command.mockReset();
      command.mockResolvedValue({ status: "ok", data: task });
    }
  });

  it("lists the tasks of a board", async () => {
    commands.listBoardTasks.mockResolvedValue({ status: "ok", data: [task] });

    await expect(fetchBoardTasks("b1")).resolves.toEqual([task]);

    expect(commands.listBoardTasks).toHaveBeenCalledWith("b1");
  });

  it("fetches one task", async () => {
    await expect(fetchTask("t1")).resolves.toEqual(task);

    expect(commands.getTask).toHaveBeenCalledWith("t1");
  });

  it("creates a task from the input", async () => {
    const input = { projectId: "p1", title: "New", columnId: "c1" };

    await expect(createTask(input)).resolves.toEqual(task);

    expect(commands.createTask).toHaveBeenCalledWith(input);
  });

  it("updates a task by id", async () => {
    await updateTask("t1", { title: "Renamed", priority: "high" });

    expect(commands.updateTask).toHaveBeenCalledWith("t1", { title: "Renamed", priority: "high" });
  });

  it("archives and restores a task", async () => {
    await archiveTask("t1");
    await restoreTask("t1");

    expect(commands.archiveTask).toHaveBeenCalledWith("t1");
    expect(commands.restoreTask).toHaveBeenCalledWith("t1");
  });

  it("deletes a task", async () => {
    commands.deleteTask.mockResolvedValue({ status: "ok", data: null });

    await expect(deleteTask("t1")).resolves.toBeNull();

    expect(commands.deleteTask).toHaveBeenCalledWith("t1");
  });

  it("moves a task after another one or to the top of a column", async () => {
    await moveTask("t1", "c2", "t9");
    await moveTask("t1", "c2", null);

    expect(commands.moveTask).toHaveBeenNthCalledWith(1, "t1", "c2", "t9");
    expect(commands.moveTask).toHaveBeenNthCalledWith(2, "t1", "c2", null);
  });

  it("sends a task to a board and back to the backlog", async () => {
    await sendTaskToBoard("t1", "b2", null);
    await sendTaskToBacklog("t1");

    expect(commands.sendTaskToBoard).toHaveBeenCalledWith("t1", "b2", null);
    expect(commands.sendTaskToBacklog).toHaveBeenCalledWith("t1");
  });

  it("rejects with the backend error payload", async () => {
    const payload = { code: "NOT_FOUND", message: "task not found" };
    commands.getTask.mockResolvedValue({ status: "error", error: payload });

    await expect(fetchTask("missing")).rejects.toBe(payload);
  });
});
