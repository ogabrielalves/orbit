import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { commands, type Task } from "@/bindings";
import { i18next } from "@/i18n";
import { createBoardDetailsFixture } from "@/test/boardFixture";
import { renderApp } from "@/test/renderApp";
import { createTaskFixture } from "@/test/taskFixture";

const getBoard = vi.mocked(commands.getBoard);
const listBoardTasks = vi.mocked(commands.listBoardTasks);
const getTask = vi.mocked(commands.getTask);
const updateTask = vi.mocked(commands.updateTask);
const archiveTask = vi.mocked(commands.archiveTask);
const restoreTask = vi.mocked(commands.restoreTask);
const deleteTask = vi.mocked(commands.deleteTask);
const duplicateTask = vi.mocked(commands.duplicateTask);

const task = createTaskFixture({
  id: "t1",
  title: "Write the spec",
  description: "Draft it",
  priority: "medium",
  dueDate: "2026-11-09",
});

function mockTask(overrides: Partial<Task> = {}) {
  getTask.mockResolvedValue({ status: "ok", data: { ...task, ...overrides } });
}

async function findDrawer() {
  return screen.findByRole("dialog", { name: "Task details" });
}

async function openMenuItem(name: string) {
  await userEvent.click(await screen.findByRole("button", { name: "Task actions" }));
  await userEvent.click(await screen.findByRole("menuitem", { name }));
}

describe("TaskDrawer", () => {
  beforeEach(async () => {
    await i18next.changeLanguage("en");
    for (const command of [
      getBoard,
      listBoardTasks,
      getTask,
      updateTask,
      archiveTask,
      restoreTask,
      deleteTask,
      duplicateTask,
    ]) {
      command.mockReset();
    }
    getBoard.mockResolvedValue({ status: "ok", data: createBoardDetailsFixture() });
    listBoardTasks.mockResolvedValue({ status: "ok", data: [task] });
    mockTask();
  });

  describe("opening and closing", () => {
    it("opens from the task in the URL and loads that task", async () => {
      renderApp("/boards/b1?task=t1");

      const drawer = await findDrawer();

      expect(getTask).toHaveBeenCalledWith("t1");
      expect(await within(drawer).findByRole("textbox", { name: "Title" })).toHaveValue(
        "Write the spec",
      );
    });

    it("stays closed without a task in the URL", async () => {
      renderApp("/boards/b1");
      await screen.findByText("Write the spec");

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(getTask).not.toHaveBeenCalled();
    });

    it("opens when a card is clicked and puts the task in the URL", async () => {
      const router = renderApp("/boards/b1");

      await userEvent.click(await screen.findByText("Write the spec"));

      await findDrawer();
      expect(router.state.location.search).toEqual({ task: "t1" });
    });

    it("opens with Enter on a focused card", async () => {
      renderApp("/boards/b1");
      const card = (await screen.findByText("Write the spec")).closest("li") as HTMLElement;

      card.focus();
      await userEvent.keyboard("{Enter}");

      await findDrawer();
    });

    it("closes and clears the task from the URL", async () => {
      const router = renderApp("/boards/b1?task=t1");
      await findDrawer();

      await userEvent.click(screen.getByRole("button", { name: "Close" }));

      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      expect(router.state.location.search).toEqual({});
    });

    it("closes with Escape", async () => {
      renderApp("/boards/b1?task=t1");
      await findDrawer();

      await userEvent.keyboard("{Escape}");

      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    });

    it("shows a placeholder while the task loads", async () => {
      getTask.mockReturnValue(new Promise(() => undefined));
      renderApp("/boards/b1?task=t1");

      const drawer = await findDrawer();

      expect(within(drawer).getByRole("status")).toHaveTextContent("Loading…");
    });

    it("offers a retry when the task cannot be loaded", async () => {
      getTask.mockResolvedValueOnce({
        status: "error",
        error: { code: "NOT_FOUND", message: "task not found" },
      });
      renderApp("/boards/b1?task=t1");

      expect(await screen.findByText("Could not load the task")).toBeInTheDocument();
      await userEvent.click(screen.getByRole("button", { name: "Try again" }));

      expect(await screen.findByRole("textbox", { name: "Title" })).toHaveValue("Write the spec");
    });
  });

  describe("editing", () => {
    async function openForm() {
      renderApp("/boards/b1?task=t1");
      await screen.findByRole("textbox", { name: "Title" });
    }

    it("shows the fields of the task", async () => {
      await openForm();

      expect(screen.getByRole("textbox", { name: "Description" })).toHaveValue("Draft it");
      expect(screen.getByRole("combobox", { name: "Priority" })).toHaveValue("medium");
      expect(screen.getByLabelText("Due date")).toHaveValue("2026-11-09");
    });

    it("keeps Save disabled until something changes", async () => {
      await openForm();

      expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
      await userEvent.type(screen.getByRole("textbox", { name: "Title" }), "!");
      expect(screen.getByRole("button", { name: "Save changes" })).toBeEnabled();
    });

    it("cannot save a blank title", async () => {
      await openForm();

      await userEvent.clear(screen.getByRole("textbox", { name: "Title" }));

      expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
    });

    it("sends only the changed fields and confirms", async () => {
      updateTask.mockResolvedValue({ status: "ok", data: task });
      await openForm();

      await userEvent.clear(screen.getByRole("textbox", { name: "Title" }));
      await userEvent.type(screen.getByRole("textbox", { name: "Title" }), "Ship the spec");
      await userEvent.selectOptions(screen.getByRole("combobox", { name: "Priority" }), "Urgent");
      await userEvent.click(screen.getByRole("button", { name: "Save changes" }));

      expect(await screen.findByText("Task updated")).toBeInTheDocument();
      expect(updateTask).toHaveBeenCalledWith("t1", { title: "Ship the spec", priority: "urgent" });
    });

    it("updates the description", async () => {
      updateTask.mockResolvedValue({ status: "ok", data: task });
      await openForm();

      await userEvent.clear(screen.getByRole("textbox", { name: "Description" }));
      await userEvent.type(screen.getByRole("textbox", { name: "Description" }), "New text");
      await userEvent.click(screen.getByRole("button", { name: "Save changes" }));

      await waitFor(() =>
        expect(updateTask).toHaveBeenCalledWith("t1", { description: "New text" }),
      );
    });

    it("sets a due date", async () => {
      mockTask({ dueDate: null });
      updateTask.mockResolvedValue({ status: "ok", data: task });
      await openForm();

      expect(screen.queryByRole("button", { name: "Clear date" })).not.toBeInTheDocument();
      await userEvent.type(screen.getByLabelText("Due date"), "2026-12-24");
      await userEvent.click(screen.getByRole("button", { name: "Save changes" }));

      await waitFor(() => expect(updateTask).toHaveBeenCalledWith("t1", { dueDate: "2026-12-24" }));
    });

    it("clears the due date by sending null", async () => {
      updateTask.mockResolvedValue({ status: "ok", data: task });
      await openForm();

      await userEvent.click(screen.getByRole("button", { name: "Clear date" }));
      expect(screen.getByLabelText("Due date")).toHaveValue("");
      await userEvent.click(screen.getByRole("button", { name: "Save changes" }));

      await waitFor(() => expect(updateTask).toHaveBeenCalledWith("t1", { dueDate: null }));
    });

    it("discards the changes", async () => {
      await openForm();
      await userEvent.type(screen.getByRole("textbox", { name: "Title" }), " more");

      await userEvent.click(screen.getByRole("button", { name: "Discard" }));

      expect(screen.getByRole("textbox", { name: "Title" })).toHaveValue("Write the spec");
      expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
    });

    it("saves with Ctrl+Enter", async () => {
      updateTask.mockResolvedValue({ status: "ok", data: task });
      await openForm();

      await userEvent.type(screen.getByRole("textbox", { name: "Title" }), "!");
      await userEvent.keyboard("{Control>}{Enter}{/Control}");

      await waitFor(() => expect(updateTask).toHaveBeenCalledTimes(1));
    });

    it("keeps what was typed when the backend refuses", async () => {
      updateTask.mockResolvedValue({ status: "error", error: { code: "DATABASE", message: "x" } });
      await openForm();

      await userEvent.type(screen.getByRole("textbox", { name: "Title" }), "!");
      await userEvent.click(screen.getByRole("button", { name: "Save changes" }));

      expect(await screen.findByText("Could not access the application data.")).toBeInTheDocument();
      expect(screen.getByRole("textbox", { name: "Title" })).toHaveValue("Write the spec!");
    });

    it("limits the title and the description", async () => {
      await openForm();

      expect(screen.getByRole("textbox", { name: "Title" })).toHaveAttribute("maxlength", "200");
      expect(screen.getByRole("textbox", { name: "Description" })).toHaveAttribute(
        "maxlength",
        "20000",
      );
    });
  });

  describe("actions", () => {
    it("archives the task", async () => {
      archiveTask.mockResolvedValue({ status: "ok", data: task });
      renderApp("/boards/b1?task=t1");
      await screen.findByRole("textbox", { name: "Title" });

      await openMenuItem("Archive");

      expect(await screen.findByText("Task archived")).toBeInTheDocument();
      expect(archiveTask).toHaveBeenCalledWith("t1");
    });

    it("offers restore instead of archive for an archived task", async () => {
      mockTask({ archivedAt: "2026-11-08T10:00:00Z" });
      restoreTask.mockResolvedValue({ status: "ok", data: task });
      renderApp("/boards/b1?task=t1");
      expect(await screen.findByText(/This task is archived/)).toBeInTheDocument();

      await userEvent.click(await screen.findByRole("button", { name: "Task actions" }));
      expect(screen.queryByRole("menuitem", { name: "Archive" })).not.toBeInTheDocument();
      await userEvent.click(await screen.findByRole("menuitem", { name: "Restore" }));

      expect(await screen.findByText("Task restored")).toBeInTheDocument();
      expect(restoreTask).toHaveBeenCalledWith("t1");
    });

    it("duplicates the task with a translated title", async () => {
      duplicateTask.mockResolvedValue({ status: "ok", data: task });
      renderApp("/boards/b1?task=t1");
      await screen.findByRole("textbox", { name: "Title" });

      await openMenuItem("Duplicate");

      expect(await screen.findByText("Task duplicated")).toBeInTheDocument();
      expect(duplicateTask).toHaveBeenCalledWith("t1", "Write the spec (copy)");
    });

    it("duplicates with the Portuguese suffix", async () => {
      vi.mocked(commands.getSettings).mockResolvedValueOnce({
        status: "ok",
        data: { language: "pt-BR", vaultPath: null },
      });
      duplicateTask.mockResolvedValue({ status: "ok", data: task });
      renderApp("/boards/b1?task=t1");
      await screen.findByRole("textbox", { name: "Título" });

      await userEvent.click(await screen.findByRole("button", { name: "Ações da tarefa" }));
      await userEvent.click(await screen.findByRole("menuitem", { name: "Duplicar" }));

      await waitFor(() =>
        expect(duplicateTask).toHaveBeenCalledWith("t1", "Write the spec (cópia)"),
      );
    });

    it("asks before deleting and closes the drawer afterwards", async () => {
      deleteTask.mockResolvedValue({ status: "ok", data: null });
      const router = renderApp("/boards/b1?task=t1");
      await screen.findByRole("textbox", { name: "Title" });

      await openMenuItem("Delete");
      const confirm = await screen.findByRole("alertdialog", { name: "Delete “Write the spec”?" });
      expect(deleteTask).not.toHaveBeenCalled();
      await userEvent.click(within(confirm).getByRole("button", { name: "Delete" }));

      await waitFor(() => expect(deleteTask).toHaveBeenCalledWith("t1"));
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      expect(router.state.location.search).toEqual({});
    });

    it("keeps the task when the deletion is cancelled", async () => {
      renderApp("/boards/b1?task=t1");
      await screen.findByRole("textbox", { name: "Title" });

      await openMenuItem("Delete");
      await userEvent.click(await screen.findByRole("button", { name: "Cancel" }));

      expect(deleteTask).not.toHaveBeenCalled();
      expect(screen.getByRole("textbox", { name: "Title" })).toBeInTheDocument();
    });
  });
});
