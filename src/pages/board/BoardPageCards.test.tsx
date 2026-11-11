import { type DndContextProps, KeyboardSensor, PointerSensor } from "@dnd-kit/core";
import { act, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { commands, type Task } from "@/bindings";
import { i18next } from "@/i18n";
import { createBoardDetailsFixture } from "@/test/boardFixture";
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

const getBoard = vi.mocked(commands.getBoard);
const listBoardTasks = vi.mocked(commands.listBoardTasks);
const moveTask = vi.mocked(commands.moveTask);

const t1 = createTaskFixture({ id: "t1", title: "First", columnId: "c1", position: "a0" });
const t2 = createTaskFixture({ id: "t2", title: "Second", columnId: "c1", position: "a1" });
const t3 = createTaskFixture({ id: "t3", title: "Third", columnId: "c2", position: "a0" });

function mockTasks(tasks: Task[]) {
  listBoardTasks.mockResolvedValue({ status: "ok", data: tasks });
}

function rect(top: number, height = 40) {
  return { top, height, left: 0, width: 100, right: 100, bottom: top + height };
}

type DropOptions = { overId: string | null; draggedTop?: number; overTop?: number };

async function drop(activeId: string, { overId, draggedTop = 0, overTop = 100 }: DropOptions) {
  await act(async () => {
    dnd.props?.onDragEnd?.({
      active: { id: activeId, rect: { current: { translated: rect(draggedTop), initial: null } } },
      over: overId === null ? null : { id: overId, rect: rect(overTop) },
    } as never);
  });
}

function cardTitles(columnName: string): string[] {
  const list = screen.getByRole("list", { name: `Tasks in ${columnName}` });
  return within(list)
    .getAllByRole("listitem")
    .map((item) => item.textContent ?? "");
}

function counter(columnName: string): string {
  const handle = screen.getByRole("button", { name: `Reorder column ${columnName}` });
  return handle.textContent ?? "";
}

describe("BoardPage cards drag and drop", () => {
  beforeEach(async () => {
    await i18next.changeLanguage("en");
    dnd.props = null;
    for (const command of [getBoard, listBoardTasks, moveTask, vi.mocked(commands.moveColumn)]) {
      command.mockReset();
    }
    getBoard.mockResolvedValue({ status: "ok", data: createBoardDetailsFixture() });
    mockTasks([t1, t2, t3]);
    moveTask.mockResolvedValue({ status: "ok", data: t1 });
  });

  describe("moving", () => {
    it("moves a card to another column before the card it was dropped on", async () => {
      renderApp("/boards/b1");
      await screen.findByText("Third");

      await drop("t1", { overId: "t3", draggedTop: 0, overTop: 100 });

      expect(moveTask).toHaveBeenCalledWith("t1", "c2", null);
    });

    it("moves a card after the card when it was dropped on its lower half", async () => {
      renderApp("/boards/b1");
      await screen.findByText("Third");

      await drop("t1", { overId: "t3", draggedTop: 200, overTop: 100 });

      expect(moveTask).toHaveBeenCalledWith("t1", "c2", "t3");
    });

    it("appends the card when it is dropped on the column itself", async () => {
      renderApp("/boards/b1");
      await screen.findByText("Third");

      await drop("t1", { overId: "c2" });

      expect(moveTask).toHaveBeenCalledWith("t1", "c2", "t3");
    });

    it("can fill an empty column", async () => {
      renderApp("/boards/b1");
      await screen.findByText("Third");

      await drop("t1", { overId: "c3" });

      expect(moveTask).toHaveBeenCalledWith("t1", "c3", null);
    });

    it("reorders inside a column", async () => {
      renderApp("/boards/b1");
      await screen.findByText("Third");

      await drop("t1", { overId: "t2" });

      expect(moveTask).toHaveBeenCalledWith("t1", "c1", "t2");
    });

    it("does nothing when the card is dropped outside, on itself or in place", async () => {
      renderApp("/boards/b1");
      await screen.findByText("Third");

      await drop("t1", { overId: null });
      await drop("t1", { overId: "t1" });
      await drop("t2", { overId: "c1" });

      expect(moveTask).not.toHaveBeenCalled();
    });

    it("never reorders columns when a card is dropped, even over a column", async () => {
      renderApp("/boards/b1");
      await screen.findByText("Third");

      await drop("t1", { overId: "c3" });
      await drop("t3", { overId: "t1" });

      expect(commands.moveColumn).not.toHaveBeenCalled();
      expect(moveTask).toHaveBeenCalledTimes(2);
    });

    it("still moves columns with the same handlers", async () => {
      vi.mocked(commands.moveColumn).mockResolvedValue({
        status: "ok",
        data: createBoardDetailsFixture().columns[0] as never,
      });
      renderApp("/boards/b1");
      await screen.findByText("Third");

      await drop("c1", { overId: "c3" });

      expect(commands.moveColumn).toHaveBeenCalledWith("c1", "c3");
      expect(moveTask).not.toHaveBeenCalled();
    });
  });

  describe("optimistic update", () => {
    it("shows the card in its new place and updates the counters before the backend answers", async () => {
      moveTask.mockReturnValue(new Promise(() => undefined));
      renderApp("/boards/b1");
      await screen.findByText("Third");
      expect(counter("To do")).toContain("2");
      expect(counter("In progress")).toContain("3");

      await drop("t1", { overId: "c2" });

      await waitFor(() =>
        expect(cardTitles("In progress").map((text) => text.slice(0, 5))).toEqual([
          "Third",
          "First",
        ]),
      );
      expect(cardTitles("To do")).toHaveLength(1);
      expect(counter("To do")).toContain("1");
      expect(counter("In progress")).toContain("4");
    });

    it("puts the card back and shows an error when the backend refuses", async () => {
      moveTask.mockResolvedValue({ status: "error", error: { code: "DATABASE", message: "x" } });
      renderApp("/boards/b1");
      await screen.findByText("Third");

      await drop("t1", { overId: "c2" });

      expect(await screen.findByText("Could not access the application data.")).toBeInTheDocument();
      await waitFor(() => expect(cardTitles("To do")).toHaveLength(2));
      expect(cardTitles("In progress")).toHaveLength(1);
      expect(counter("To do")).toContain("2");
      expect(counter("In progress")).toContain("3");
    });

    it("refreshes from the backend once the move is done", async () => {
      renderApp("/boards/b1");
      await screen.findByText("Third");
      listBoardTasks.mockClear();

      await drop("t1", { overId: "c2" });

      await waitFor(() => expect(listBoardTasks).toHaveBeenCalledTimes(1));
    });
  });

  describe("feedback and accessibility", () => {
    it("highlights the column that would receive the card", async () => {
      renderApp("/boards/b1");
      await screen.findByText("Third");

      await act(async () => {
        dnd.props?.onDragStart?.({ active: { id: "t1" } } as never);
        dnd.props?.onDragOver?.({ active: { id: "t1" }, over: { id: "t3" } } as never);
      });

      const column = screen
        .getByRole("list", { name: "Tasks in In progress" })
        .closest("li[class*='bg-surface-column']");
      expect(column).toHaveClass("ring-primary");

      await act(async () => {
        dnd.props?.onDragCancel?.({ active: { id: "t1" } } as never);
      });
      expect(column).not.toHaveClass("ring-primary");
    });

    it("lets the keyboard drag cards as well as the pointer", async () => {
      renderApp("/boards/b1");
      await screen.findByText("Third");

      const sensors = dnd.props?.sensors?.map((descriptor) => descriptor.sensor);

      expect(sensors).toEqual(expect.arrayContaining([PointerSensor, KeyboardSensor]));
    });

    it("makes the cards focusable and announced as sortable", async () => {
      renderApp("/boards/b1");
      await screen.findByText("Third");

      const [card] = within(screen.getByRole("list", { name: "Tasks in To do" })).getAllByRole(
        "listitem",
      );

      expect(card).toHaveAttribute("tabindex", "0");
      expect(card).toHaveAttribute("aria-roledescription", "sortable");
    });

    it("announces card moves with the card and column names", async () => {
      renderApp("/boards/b1");
      await screen.findByText("Third");
      const announcements = dnd.props?.accessibility?.announcements;
      const active = { id: "t1" };

      expect(announcements?.onDragStart?.({ active } as never)).toBe("Card First picked up.");
      expect(announcements?.onDragOver?.({ active, over: { id: "t3" } } as never)).toBe(
        "Card First is over In progress.",
      );
      expect(announcements?.onDragOver?.({ active, over: { id: "c3" } } as never)).toBe(
        "Card First is over Done.",
      );
      expect(announcements?.onDragEnd?.({ active, over: { id: "c2" } } as never)).toBe(
        "Card First dropped in In progress.",
      );
      expect(announcements?.onDragEnd?.({ active, over: null } as never)).toBe(
        "Moving cancelled. Card First returned to its original place.",
      );
      expect(announcements?.onDragCancel?.({ active } as never)).toBe(
        "Moving cancelled. Card First returned to its original place.",
      );
    });

    it("announces in Portuguese", async () => {
      vi.mocked(commands.getSettings).mockResolvedValueOnce({
        status: "ok",
        data: { language: "pt-BR", vaultPath: "/vault", userName: "Gabriel" },
      });
      renderApp("/boards/b1");
      await screen.findByText("Third");

      const announcements = dnd.props?.accessibility?.announcements;

      expect(announcements?.onDragStart?.({ active: { id: "t1" } } as never)).toBe(
        "Card First selecionado.",
      );
    });
  });
});
