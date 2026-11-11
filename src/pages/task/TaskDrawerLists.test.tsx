import type { DndContextProps } from "@dnd-kit/core";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { type ChecklistItem, commands, type Task } from "@/bindings";
import { i18next } from "@/i18n";
import { createBoardDetailsFixture } from "@/test/boardFixture";
import { renderApp } from "@/test/renderApp";
import { createTaskFixture } from "@/test/taskFixture";

const dnd = vi.hoisted(() => ({
  instances: new Map<number, unknown>(),
  next: 0,
}));

vi.mock("@dnd-kit/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@dnd-kit/core")>();
  const { createElement, useRef } = await import("react");
  return {
    ...actual,
    DndContext: (props: DndContextProps) => {
      const id = useRef<number | null>(null);
      if (id.current === null) {
        id.current = dnd.next;
        dnd.next += 1;
      }
      dnd.instances.set(id.current, props);
      return createElement(actual.DndContext, props);
    },
  };
});

const getBoard = vi.mocked(commands.getBoard);
const listBoardTasks = vi.mocked(commands.listBoardTasks);
const getTask = vi.mocked(commands.getTask);
const listSubtasks = vi.mocked(commands.listSubtasks);
const createSubtask = vi.mocked(commands.createSubtask);
const setSubtaskDone = vi.mocked(commands.setSubtaskDone);
const moveSubtask = vi.mocked(commands.moveSubtask);
const updateTask = vi.mocked(commands.updateTask);
const deleteTask = vi.mocked(commands.deleteTask);
const listChecklistItems = vi.mocked(commands.listChecklistItems);
const createChecklistItem = vi.mocked(commands.createChecklistItem);
const updateChecklistItem = vi.mocked(commands.updateChecklistItem);
const moveChecklistItem = vi.mocked(commands.moveChecklistItem);
const deleteChecklistItem = vi.mocked(commands.deleteChecklistItem);

const task = createTaskFixture({ id: "t1", title: "Write the spec" });

function subtask(id: string, title: string, isDone = false): Task {
  return createTaskFixture({
    id,
    title,
    parentTaskId: "t1",
    position: id,
    completedAt: isDone ? "2026-11-08T10:00:00Z" : null,
  });
}

function item(id: string, text: string, isDone = false): ChecklistItem {
  return {
    id,
    taskId: "t1",
    text,
    isDone,
    position: id,
    createdAt: "2026-11-08T10:00:00Z",
    updatedAt: "2026-11-08T10:00:00Z",
  };
}

function dragEnd(instanceIndex: number, activeId: string, overId: string) {
  const props = [...dnd.instances.values()][instanceIndex] as DndContextProps;
  return act(async () => {
    props.onDragEnd?.({ active: { id: activeId }, over: { id: overId } } as never);
  });
}

async function openDrawer() {
  renderApp("/boards/b1?task=t1");
  await screen.findByRole("textbox", { name: "Title" });
}

async function openRowMenu(label: string, name: string, itemName: string) {
  await userEvent.click(await screen.findByRole("button", { name: `${label} ${name}` }));
  await userEvent.click(await screen.findByRole("menuitem", { name: itemName }));
}

describe("TaskDrawer subtasks and checklist", () => {
  beforeEach(async () => {
    await i18next.changeLanguage("en");
    dnd.instances.clear();
    dnd.next = 0;
    for (const command of [
      getBoard,
      listBoardTasks,
      getTask,
      listSubtasks,
      createSubtask,
      setSubtaskDone,
      moveSubtask,
      updateTask,
      deleteTask,
      listChecklistItems,
      createChecklistItem,
      updateChecklistItem,
      moveChecklistItem,
      deleteChecklistItem,
    ]) {
      command.mockReset();
    }
    getBoard.mockResolvedValue({ status: "ok", data: createBoardDetailsFixture() });
    listBoardTasks.mockResolvedValue({ status: "ok", data: [task] });
    getTask.mockResolvedValue({ status: "ok", data: task });
    listSubtasks.mockResolvedValue({
      status: "ok",
      data: [subtask("s1", "Outline", true), subtask("s2", "Draft")],
    });
    listChecklistItems.mockResolvedValue({
      status: "ok",
      data: [item("i1", "Check links"), item("i2", "Proofread", true)],
    });
  });

  describe("subtasks", () => {
    it("lists the subtasks of the task with their progress", async () => {
      await openDrawer();

      const list = await screen.findByRole("list", { name: "Subtask list" });

      expect(listSubtasks).toHaveBeenCalledWith("t1");
      expect(
        within(list)
          .getAllByRole("checkbox")
          .map((box) => (box as HTMLInputElement).checked),
      ).toEqual([true, false]);
      const section = screen.getByRole("region", { name: "Subtasks" });
      expect(within(section).getByText("1/2 done")).toBeInTheDocument();
    });

    it("adds a subtask under the open task", async () => {
      createSubtask.mockResolvedValue({ status: "ok", data: subtask("s3", "Review") });
      await openDrawer();

      await userEvent.type(
        await screen.findByRole("textbox", { name: "New subtask" }),
        "Review{Enter}",
      );

      await waitFor(() =>
        expect(createSubtask).toHaveBeenCalledWith({ parentTaskId: "t1", title: "Review" }),
      );
    });

    it("completes and reopens a subtask", async () => {
      setSubtaskDone.mockResolvedValue({ status: "ok", data: subtask("s2", "Draft", true) });
      await openDrawer();

      await userEvent.click(await screen.findByRole("checkbox", { name: "Draft" }));
      await userEvent.click(screen.getByRole("checkbox", { name: "Outline" }));

      expect(setSubtaskDone).toHaveBeenNthCalledWith(1, "s2", true);
      expect(setSubtaskDone).toHaveBeenNthCalledWith(2, "s1", false);
    });

    it("renames a subtask through the task update", async () => {
      updateTask.mockResolvedValue({ status: "ok", data: subtask("s2", "Rough draft") });
      await openDrawer();
      await screen.findByRole("list", { name: "Subtask list" });

      await openRowMenu("Actions for subtask", "Draft", "Rename");
      const field = await screen.findByRole("textbox", { name: "Subtask title" });
      await userEvent.clear(field);
      await userEvent.type(field, "Rough draft{Enter}");

      expect(updateTask).toHaveBeenCalledWith("s2", { title: "Rough draft" });
    });

    it("deletes a subtask", async () => {
      deleteTask.mockResolvedValue({ status: "ok", data: null });
      await openDrawer();
      await screen.findByRole("list", { name: "Subtask list" });

      await openRowMenu("Actions for subtask", "Draft", "Delete");

      expect(deleteTask).toHaveBeenCalledWith("s2");
    });

    it("reorders the subtasks", async () => {
      moveSubtask.mockResolvedValue({ status: "ok", data: subtask("s1", "Outline", true) });
      await openDrawer();
      await screen.findByRole("list", { name: "Subtask list" });

      await dragEnd(1, "s1", "s2");

      expect(moveSubtask).toHaveBeenCalledWith("s1", "s2");
    });

    it("does not offer subtasks for a task that is itself a subtask", async () => {
      getTask.mockResolvedValue({ status: "ok", data: subtask("s9", "Child") });
      renderApp("/boards/b1?task=s9");

      await screen.findByRole("textbox", { name: "Title" });

      expect(screen.queryByRole("heading", { name: "Subtasks" })).not.toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "Checklist" })).toBeInTheDocument();
    });
  });

  describe("checklist", () => {
    it("lists the items of the task with their progress", async () => {
      await openDrawer();

      const list = await screen.findByRole("list", { name: "Checklist items" });

      expect(listChecklistItems).toHaveBeenCalledWith("t1");
      expect(within(list).getByText("Proofread")).toHaveClass("line-through");
      expect(screen.getAllByText("1/2 done")).toHaveLength(2);
    });

    it("adds an item", async () => {
      createChecklistItem.mockResolvedValue({ status: "ok", data: item("i3", "Publish") });
      await openDrawer();

      await userEvent.type(
        await screen.findByRole("textbox", { name: "New checklist item" }),
        "Publish{Enter}",
      );

      await waitFor(() =>
        expect(createChecklistItem).toHaveBeenCalledWith({ taskId: "t1", text: "Publish" }),
      );
    });

    it("checks and unchecks an item", async () => {
      updateChecklistItem.mockResolvedValue({
        status: "ok",
        data: item("i1", "Check links", true),
      });
      await openDrawer();

      await userEvent.click(await screen.findByRole("checkbox", { name: "Check links" }));
      await userEvent.click(screen.getByRole("checkbox", { name: "Proofread" }));

      expect(updateChecklistItem).toHaveBeenNthCalledWith(1, "i1", { isDone: true });
      expect(updateChecklistItem).toHaveBeenNthCalledWith(2, "i2", { isDone: false });
    });

    it("renames an item", async () => {
      updateChecklistItem.mockResolvedValue({ status: "ok", data: item("i1", "Check all links") });
      await openDrawer();
      await screen.findByRole("list", { name: "Checklist items" });

      await openRowMenu("Actions for item", "Check links", "Rename");
      const field = await screen.findByRole("textbox", { name: "Item text" });
      await userEvent.clear(field);
      await userEvent.type(field, "Check all links{Enter}");

      expect(updateChecklistItem).toHaveBeenCalledWith("i1", { text: "Check all links" });
    });

    it("removes an item", async () => {
      deleteChecklistItem.mockResolvedValue({ status: "ok", data: null });
      await openDrawer();
      await screen.findByRole("list", { name: "Checklist items" });

      await openRowMenu("Actions for item", "Proofread", "Delete");

      expect(deleteChecklistItem).toHaveBeenCalledWith("i2");
    });

    it("reorders the items", async () => {
      moveChecklistItem.mockResolvedValue({ status: "ok", data: item("i1", "Check links") });
      await openDrawer();
      await screen.findByRole("list", { name: "Checklist items" });

      await dragEnd(2, "i1", "i2");

      expect(moveChecklistItem).toHaveBeenCalledWith("i1", "i2");
    });

    it("shows the checklist in Portuguese", async () => {
      vi.mocked(commands.getSettings).mockResolvedValueOnce({
        status: "ok",
        data: { language: "pt-BR", vaultPath: "/vault", userName: "Gabriel" },
      });
      renderApp("/boards/b1?task=t1");

      expect(await screen.findByRole("heading", { name: "Subtarefas" })).toBeInTheDocument();
      expect(
        await screen.findByRole("textbox", { name: "Novo item do checklist" }),
      ).toBeInTheDocument();
    });
  });
});
