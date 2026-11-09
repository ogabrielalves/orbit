import type { DndContextProps } from "@dnd-kit/core";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { type BoardDetails, commands } from "@/bindings";
import { i18next } from "@/i18n";
import { createBoardDetailsFixture, createColumnFixture } from "@/test/boardFixture";
import { renderApp } from "@/test/renderApp";

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

const getBoard = vi.mocked(commands.getBoard);
const createColumn = vi.mocked(commands.createColumn);
const updateColumn = vi.mocked(commands.updateColumn);
const moveColumn = vi.mocked(commands.moveColumn);
const deleteColumn = vi.mocked(commands.deleteColumn);
const updateBoard = vi.mocked(commands.updateBoard);
const deleteBoard = vi.mocked(commands.deleteBoard);

function mockBoard(details: BoardDetails = createBoardDetailsFixture()) {
  getBoard.mockResolvedValue({ status: "ok", data: details });
}

function columnNames(): string[] {
  const list = screen.getByRole("list", { name: "Board columns" });
  return within(list)
    .getAllByRole("listitem")
    .map((item) => within(item).getByRole("button", { name: /^Reorder column/ }).textContent ?? "");
}

async function openColumnMenu(name: string, item: string) {
  await userEvent.click(await screen.findByRole("button", { name: `Actions for column ${name}` }));
  await userEvent.click(await screen.findByRole("menuitem", { name: item }));
}

async function openBoardMenu(item: string) {
  await userEvent.click(await screen.findByRole("button", { name: "Board actions" }));
  await userEvent.click(await screen.findByRole("menuitem", { name: item }));
}

describe("BoardPage", () => {
  beforeEach(async () => {
    await i18next.changeLanguage("en");
    dnd.props = null;
    for (const command of [
      getBoard,
      createColumn,
      updateColumn,
      moveColumn,
      deleteColumn,
      updateBoard,
      deleteBoard,
    ]) {
      command.mockReset();
    }
    mockBoard();
  });

  describe("states", () => {
    it("loads the board named in the URL", async () => {
      renderApp("/boards/b1");

      await screen.findByRole("heading", { level: 1, name: "Sprint 14" });

      expect(getBoard).toHaveBeenCalledWith("b1");
    });

    it("shows a loading placeholder", async () => {
      getBoard.mockReturnValue(new Promise(() => undefined));
      renderApp("/boards/b1");

      expect(await screen.findByRole("status")).toHaveTextContent("Loading…");
    });

    it("explains a missing board and offers the way back", async () => {
      getBoard.mockResolvedValue({
        status: "error",
        error: { code: "NOT_FOUND", message: "board not found" },
      });
      renderApp("/boards/missing");

      const alert = await screen.findByRole("alert");

      expect(alert).toHaveTextContent("Could not load the board");
      expect(alert).toHaveTextContent("The item was not found. It may have been removed.");
      expect(screen.getByRole("link", { name: "Back to projects" })).toHaveAttribute(
        "href",
        "/projects",
      );
    });

    it("retries loading from the error state", async () => {
      getBoard.mockResolvedValueOnce({
        status: "error",
        error: { code: "DATABASE", message: "x" },
      });
      mockBoard();
      renderApp("/boards/b1");

      await userEvent.click(await screen.findByRole("button", { name: "Try again" }));

      expect(
        await screen.findByRole("heading", { level: 1, name: "Sprint 14" }),
      ).toBeInTheDocument();
    });

    it("shows an empty state with a way to create the first column", async () => {
      mockBoard(createBoardDetailsFixture({ columns: [] }));
      renderApp("/boards/b1");

      expect(
        await screen.findByRole("heading", { name: "This board has no columns" }),
      ).toBeInTheDocument();
      await userEvent.click(
        screen.getAllByRole("button", { name: "New column" })[1] as HTMLElement,
      );

      expect(await screen.findByRole("dialog", { name: "New column" })).toBeInTheDocument();
    });
  });

  describe("content", () => {
    it("links back to the project that owns the board", async () => {
      renderApp("/boards/b1");

      expect(await screen.findByRole("link", { name: "Back to project" })).toHaveAttribute(
        "href",
        "/projects/p1",
      );
    });

    it("summarizes the columns and the tasks", async () => {
      renderApp("/boards/b1");

      expect(await screen.findByText("3 columns · 5 tasks")).toBeInTheDocument();
    });

    it("lists the columns in the order the backend returned them", async () => {
      renderApp("/boards/b1");
      await screen.findByRole("list", { name: "Board columns" });

      expect(columnNames()).toEqual(["To do2", "In progress3", "Done0"]);
    });

    it("shows a placeholder instead of tasks that do not exist yet", async () => {
      renderApp("/boards/b1");
      await screen.findByRole("list", { name: "Board columns" });

      expect(screen.getAllByText("No tasks")).toHaveLength(3);
    });

    it("paints the dot of a column with its color and keeps a neutral one without color", async () => {
      renderApp("/boards/b1");
      const list = await screen.findByRole("list", { name: "Board columns" });
      const items = within(list).getAllByRole("listitem");

      const coloredDot = within(items[1] as HTMLElement).getByRole("button", { name: /Reorder/ })
        .firstElementChild as HTMLElement;
      const neutralDot = within(items[0] as HTMLElement).getByRole("button", { name: /Reorder/ })
        .firstElementChild as HTMLElement;

      expect(coloredDot.style.backgroundColor).toBe("var(--color-project-ember)");
      expect(neutralDot.style.backgroundColor).toBe("var(--color-fg-subtle)");
    });

    it("blocks creating more columns at the limit and says why", async () => {
      const many = Array.from({ length: 30 }, (_, index) =>
        createColumnFixture(`c${index}`, `Column ${index}`),
      );
      mockBoard(createBoardDetailsFixture({ columns: many }));
      renderApp("/boards/b1");

      expect(await screen.findByRole("button", { name: "New column" })).toBeDisabled();
      expect(
        screen.getByText("The board already has the maximum of 30 columns."),
      ).toBeInTheDocument();
    });

    it("does not block creating columns below the limit", async () => {
      renderApp("/boards/b1");

      expect(await screen.findByRole("button", { name: "New column" })).toBeEnabled();
    });
  });

  describe("creating and editing columns", () => {
    it("creates a column with a color and shows it after the refresh", async () => {
      createColumn.mockResolvedValue({ status: "ok", data: createColumnFixture("c4", "QA") });
      renderApp("/boards/b1");
      await userEvent.click(await screen.findByRole("button", { name: "New column" }));

      await userEvent.type(await screen.findByRole("textbox", { name: "Column name" }), "QA");
      await userEvent.click(screen.getByRole("radio", { name: "Lagoon" }));
      mockBoard(
        createBoardDetailsFixture({
          columns: [
            ...createBoardDetailsFixture().columns,
            createColumnFixture("c4", "QA", { color: "lagoon" }),
          ],
        }),
      );
      await userEvent.click(screen.getByRole("button", { name: "Create column" }));

      await waitFor(() => expect(columnNames()).toContain("QA0"));
      expect(createColumn).toHaveBeenCalledWith({
        boardId: "b1",
        name: "QA",
        color: "lagoon",
        kind: "todo",
      });
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("creates a column without color by default", async () => {
      createColumn.mockResolvedValue({ status: "ok", data: createColumnFixture("c4", "QA") });
      renderApp("/boards/b1");
      await userEvent.click(await screen.findByRole("button", { name: "New column" }));

      await userEvent.type(await screen.findByRole("textbox", { name: "Column name" }), "QA");
      await userEvent.click(screen.getByRole("button", { name: "Create column" }));

      await waitFor(() => expect(createColumn).toHaveBeenCalledTimes(1));
      expect(createColumn).toHaveBeenCalledWith({
        boardId: "b1",
        name: "QA",
        color: null,
        kind: "todo",
      });
    });

    it("creates a column of the chosen kind", async () => {
      createColumn.mockResolvedValue({ status: "ok", data: createColumnFixture("c4", "QA") });
      renderApp("/boards/b1");
      await userEvent.click(await screen.findByRole("button", { name: "New column" }));

      await userEvent.type(await screen.findByRole("textbox", { name: "Column name" }), "QA");
      expect(screen.getByRole("combobox", { name: "Column type" })).toHaveValue("todo");
      await userEvent.selectOptions(screen.getByRole("combobox", { name: "Column type" }), "Done");
      await userEvent.click(screen.getByRole("button", { name: "Create column" }));

      await waitFor(() => expect(createColumn).toHaveBeenCalledTimes(1));
      expect(createColumn).toHaveBeenCalledWith({
        boardId: "b1",
        name: "QA",
        color: null,
        kind: "done",
      });
    });

    it("shows the current kind when editing and sends the new one", async () => {
      updateColumn.mockResolvedValue({ status: "ok", data: createColumnFixture("c3", "x") });
      renderApp("/boards/b1");
      await openColumnMenu("Done", "Edit column");

      const kindField = await screen.findByRole("combobox", { name: "Column type" });
      expect(kindField).toHaveValue("done");
      await userEvent.selectOptions(kindField, "In progress");
      await userEvent.click(screen.getByRole("button", { name: "Save" }));

      await waitFor(() => expect(updateColumn).toHaveBeenCalledTimes(1));
      expect(updateColumn).toHaveBeenCalledWith("c3", {
        name: "Done",
        color: null,
        kind: "in_progress",
      });
    });

    it("keeps the create button disabled until the name has content", async () => {
      renderApp("/boards/b1");
      await userEvent.click(await screen.findByRole("button", { name: "New column" }));

      expect(await screen.findByRole("button", { name: "Create column" })).toBeDisabled();
    });

    it("limits the column name to 60 characters", async () => {
      renderApp("/boards/b1");
      await userEvent.click(await screen.findByRole("button", { name: "New column" }));

      expect(await screen.findByRole("textbox", { name: "Column name" })).toHaveAttribute(
        "maxlength",
        "60",
      );
    });

    it("edits the name and color of a column", async () => {
      updateColumn.mockResolvedValue({ status: "ok", data: createColumnFixture("c1", "Backlog") });
      renderApp("/boards/b1");
      await openColumnMenu("To do", "Edit column");

      const nameField = await screen.findByRole("textbox", { name: "Column name" });
      expect(nameField).toHaveValue("To do");
      expect(screen.getByRole("radio", { name: "No color" })).toBeChecked();
      await userEvent.clear(nameField);
      await userEvent.type(nameField, "Backlog");
      await userEvent.click(screen.getByRole("radio", { name: "Violet" }));
      await userEvent.click(screen.getByRole("button", { name: "Save" }));

      await waitFor(() => expect(updateColumn).toHaveBeenCalledTimes(1));
      expect(updateColumn).toHaveBeenCalledWith("c1", {
        name: "Backlog",
        color: "violet",
        kind: "todo",
      });
    });

    it("shows the current color when editing and clears it with No color", async () => {
      updateColumn.mockResolvedValue({ status: "ok", data: createColumnFixture("c2", "x") });
      renderApp("/boards/b1");
      await openColumnMenu("In progress", "Edit column");

      expect(await screen.findByRole("radio", { name: "Ember" })).toBeChecked();
      await userEvent.click(screen.getByRole("radio", { name: "No color" }));
      await userEvent.click(screen.getByRole("button", { name: "Save" }));

      await waitFor(() => expect(updateColumn).toHaveBeenCalledTimes(1));
      expect(updateColumn).toHaveBeenCalledWith("c2", {
        name: "In progress",
        color: null,
        kind: "in_progress",
      });
    });

    it("shows the translated error and keeps the form open when the backend refuses", async () => {
      createColumn.mockResolvedValue({
        status: "error",
        error: { code: "VALIDATION", message: "board already has 30 columns" },
      });
      renderApp("/boards/b1");
      await userEvent.click(await screen.findByRole("button", { name: "New column" }));
      await userEvent.type(await screen.findByRole("textbox", { name: "Column name" }), "QA");

      await userEvent.click(screen.getByRole("button", { name: "Create column" }));

      expect(await screen.findByText("The information provided is not valid.")).toBeInTheDocument();
      expect(screen.getByRole("dialog", { name: "New column" })).toBeInTheDocument();
    });

    it("submits with Ctrl+Enter", async () => {
      createColumn.mockResolvedValue({ status: "ok", data: createColumnFixture("c4", "QA") });
      renderApp("/boards/b1");
      await userEvent.click(await screen.findByRole("button", { name: "New column" }));

      await userEvent.type(
        await screen.findByRole("textbox", { name: "Column name" }),
        "QA{Control>}{Enter}{/Control}",
      );

      await waitFor(() => expect(createColumn).toHaveBeenCalledTimes(1));
    });
  });

  describe("deleting columns", () => {
    it("deletes an empty column after confirming", async () => {
      deleteColumn.mockResolvedValue({ status: "ok", data: null });
      renderApp("/boards/b1");
      await openColumnMenu("Done", "Delete column");

      expect(
        await screen.findByRole("alertdialog", { name: "Delete the column “Done”?" }),
      ).toBeInTheDocument();
      mockBoard(
        createBoardDetailsFixture({ columns: createBoardDetailsFixture().columns.slice(0, 2) }),
      );
      await userEvent.click(screen.getByRole("button", { name: "Delete" }));

      await waitFor(() => expect(columnNames()).toEqual(["To do2", "In progress3"]));
      expect(deleteColumn).toHaveBeenCalledWith("c3");
    });

    it("warns about the tasks of a column and does not allow deleting it", async () => {
      renderApp("/boards/b1");
      await openColumnMenu("In progress", "Delete column");

      const dialog = await screen.findByRole("alertdialog", {
        name: "“In progress” cannot be deleted",
      });

      expect(dialog).toHaveAccessibleDescription(
        "This column still has 3 tasks. Move them to another column before deleting.",
      );
      expect(screen.getByRole("button", { name: "Delete" })).toBeDisabled();
      expect(deleteColumn).not.toHaveBeenCalled();
    });

    it("uses the singular for a column with a single task", async () => {
      mockBoard(
        createBoardDetailsFixture({
          columns: [createColumnFixture("c1", "Solo", { taskCount: 1 })],
        }),
      );
      renderApp("/boards/b1");
      await openColumnMenu("Solo", "Delete column");

      expect(await screen.findByRole("alertdialog")).toHaveAccessibleDescription(
        "This column still has 1 task. Move it to another column before deleting.",
      );
    });

    it("can be cancelled", async () => {
      renderApp("/boards/b1");
      await openColumnMenu("Done", "Delete column");

      await userEvent.click(await screen.findByRole("button", { name: "Cancel" }));

      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
      expect(deleteColumn).not.toHaveBeenCalled();
    });

    it("explains a conflict from the backend and keeps the dialog open", async () => {
      deleteColumn.mockResolvedValue({
        status: "error",
        error: { code: "CONFLICT", message: "column still has tasks" },
      });
      renderApp("/boards/b1");
      await openColumnMenu("Done", "Delete column");

      await userEvent.click(await screen.findByRole("button", { name: "Delete" }));

      expect(
        await screen.findByText("The item was changed elsewhere. Reload and try again."),
      ).toBeInTheDocument();
      expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    });
  });

  describe("reordering columns", () => {
    it("moves a column to the right from its menu and shows it immediately", async () => {
      moveColumn.mockReturnValue(new Promise(() => undefined));
      renderApp("/boards/b1");
      await openColumnMenu("To do", "Move right");

      await waitFor(() => expect(columnNames()).toEqual(["In progress3", "To do2", "Done0"]));
      expect(moveColumn).toHaveBeenCalledWith("c1", "c2");
    });

    it("moves a column to the left from its menu", async () => {
      moveColumn.mockReturnValue(new Promise(() => undefined));
      renderApp("/boards/b1");
      await openColumnMenu("Done", "Move left");

      await waitFor(() => expect(columnNames()).toEqual(["To do2", "Done0", "In progress3"]));
      expect(moveColumn).toHaveBeenCalledWith("c3", "c1");
    });

    it("asks to be the first column when moved to the first place", async () => {
      moveColumn.mockReturnValue(new Promise(() => undefined));
      renderApp("/boards/b1");
      await openColumnMenu("In progress", "Move left");

      await waitFor(() => expect(columnNames()).toEqual(["In progress3", "To do2", "Done0"]));
      expect(moveColumn).toHaveBeenCalledWith("c2", null);
    });

    it("cannot move the first column left or the last one right", async () => {
      renderApp("/boards/b1");
      await userEvent.click(
        await screen.findByRole("button", { name: "Actions for column To do" }),
      );
      expect(await screen.findByRole("menuitem", { name: "Move left" })).toHaveAttribute(
        "aria-disabled",
        "true",
      );
      await userEvent.keyboard("{Escape}");

      await userEvent.click(screen.getByRole("button", { name: "Actions for column Done" }));
      expect(await screen.findByRole("menuitem", { name: "Move right" })).toHaveAttribute(
        "aria-disabled",
        "true",
      );
    });

    it("rolls the order back and explains when the backend refuses the move", async () => {
      moveColumn.mockResolvedValue({
        status: "error",
        error: { code: "NOT_FOUND", message: "column not found" },
      });
      renderApp("/boards/b1");
      await openColumnMenu("To do", "Move right");

      expect(
        await screen.findByText("The item was not found. It may have been removed."),
      ).toBeInTheDocument();
      await waitFor(() => expect(columnNames()).toEqual(["To do2", "In progress3", "Done0"]));
    });

    it("moves a column when it is dropped over another one", async () => {
      moveColumn.mockReturnValue(new Promise(() => undefined));
      renderApp("/boards/b1");
      await screen.findByRole("list", { name: "Board columns" });

      dnd.props?.onDragEnd?.({ active: { id: "c1" }, over: { id: "c3" } } as never);

      await waitFor(() => expect(moveColumn).toHaveBeenCalledWith("c1", "c3"));
      await waitFor(() => expect(columnNames()).toEqual(["In progress3", "Done0", "To do2"]));
    });

    it("does nothing when a column is dropped outside any column", async () => {
      renderApp("/boards/b1");
      await screen.findByRole("list", { name: "Board columns" });

      dnd.props?.onDragEnd?.({ active: { id: "c1" }, over: null } as never);

      expect(moveColumn).not.toHaveBeenCalled();
    });

    it("does nothing when a column is dropped over itself", async () => {
      renderApp("/boards/b1");
      await screen.findByRole("list", { name: "Board columns" });

      dnd.props?.onDragEnd?.({ active: { id: "c2" }, over: { id: "c2" } } as never);

      expect(moveColumn).not.toHaveBeenCalled();
    });

    it("gives every handle a name and the keyboard instructions in the active language", async () => {
      renderApp("/boards/b1");
      await screen.findByRole("list", { name: "Board columns" });

      expect(screen.getByRole("button", { name: "Reorder column To do" })).toBeInTheDocument();
      expect(dnd.props?.accessibility?.screenReaderInstructions?.draggable).toBe(
        "To reorder, press space, use the arrow keys to move the column and press space again to drop it.",
      );
    });

    it("announces the drag to screen readers", async () => {
      renderApp("/boards/b1");
      await screen.findByRole("list", { name: "Board columns" });
      const announcements = dnd.props?.accessibility?.announcements;
      const active = { id: "c1" } as never;

      expect(announcements?.onDragStart?.({ active } as never)).toBe(
        "Column To do picked up. Position 1 of 3.",
      );
      expect(announcements?.onDragOver?.({ active, over: { id: "c2" } } as never)).toBe(
        "Column To do moved to position 2 of 3.",
      );
      expect(announcements?.onDragEnd?.({ active, over: { id: "c3" } } as never)).toBe(
        "Column To do dropped at position 3 of 3.",
      );
      expect(announcements?.onDragEnd?.({ active, over: null } as never)).toBe(
        "Reordering cancelled. Column To do returned to its original position.",
      );
      expect(announcements?.onDragCancel?.({ active } as never)).toBe(
        "Reordering cancelled. Column To do returned to its original position.",
      );
    });
  });

  describe("board actions", () => {
    it("renames the board and shows the new name", async () => {
      updateBoard.mockResolvedValue({ status: "ok", data: createBoardDetailsFixture().board });
      renderApp("/boards/b1");
      await openBoardMenu("Rename board");

      const nameField = await screen.findByRole("textbox", { name: "Board name" });
      expect(nameField).toHaveValue("Sprint 14");
      await userEvent.clear(nameField);
      await userEvent.type(nameField, "Sprint 15");
      mockBoard(
        createBoardDetailsFixture({
          board: { ...createBoardDetailsFixture().board, name: "Sprint 15" },
        }),
      );
      await userEvent.click(screen.getByRole("button", { name: "Save" }));

      expect(
        await screen.findByRole("heading", { level: 1, name: "Sprint 15" }),
      ).toBeInTheDocument();
      expect(updateBoard).toHaveBeenCalledWith("b1", { name: "Sprint 15" });
    });

    it("limits the board name to 120 characters", async () => {
      renderApp("/boards/b1");
      await openBoardMenu("Rename board");

      expect(await screen.findByRole("textbox", { name: "Board name" })).toHaveAttribute(
        "maxlength",
        "120",
      );
    });

    it("cannot rename the board to a blank name", async () => {
      renderApp("/boards/b1");
      await openBoardMenu("Rename board");
      await userEvent.clear(await screen.findByRole("textbox", { name: "Board name" }));

      expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    });

    it("deletes the board after confirming and goes back to its project", async () => {
      deleteBoard.mockResolvedValue({ status: "ok", data: null });
      const router = renderApp("/boards/b1");
      await openBoardMenu("Delete board");

      const dialog = await screen.findByRole("alertdialog", {
        name: "Delete the board “Sprint 14”?",
      });
      expect(dialog).toHaveAccessibleDescription(
        "The columns will be removed and the tasks of the board return to the backlog.",
      );
      await userEvent.click(screen.getByRole("button", { name: "Delete" }));

      await waitFor(() => expect(router.state.location.pathname).toBe("/projects/p1"));
      expect(deleteBoard).toHaveBeenCalledWith("b1");
      expect(getBoard).toHaveBeenCalledTimes(1);
    });

    it("keeps the board when the deletion is cancelled", async () => {
      renderApp("/boards/b1");
      await openBoardMenu("Delete board");

      await userEvent.click(await screen.findByRole("button", { name: "Cancel" }));

      expect(deleteBoard).not.toHaveBeenCalled();
      expect(screen.getByRole("heading", { level: 1, name: "Sprint 14" })).toBeInTheDocument();
    });

    it("stays on the board when the backend refuses to delete it", async () => {
      deleteBoard.mockResolvedValue({ status: "error", error: { code: "DATABASE", message: "x" } });
      const router = renderApp("/boards/b1");
      await openBoardMenu("Delete board");

      await userEvent.click(await screen.findByRole("button", { name: "Delete" }));

      expect(await screen.findByText("Could not access the application data.")).toBeInTheDocument();
      expect(router.state.location.pathname).toBe("/boards/b1");
    });
  });

  it("follows the language saved in the settings", async () => {
    vi.mocked(commands.getSettings).mockResolvedValueOnce({
      status: "ok",
      data: { language: "pt-BR", vaultPath: null },
    });
    renderApp("/boards/b1");

    expect(await screen.findByText("3 colunas · 5 tarefas")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Voltar ao projeto" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reordenar a coluna To do" })).toBeInTheDocument();
  });
});
