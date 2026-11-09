import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Board, BoardColumn, BoardDetails, CreateBoardInput } from "@/bindings";
import {
  createBoard,
  createColumn,
  deleteBoard,
  deleteColumn,
  fetchBoard,
  moveColumn,
  updateBoard,
  updateColumn,
} from "@/modules/boards/api";

const commands = vi.hoisted(() => ({
  getBoard: vi.fn(),
  createBoard: vi.fn(),
  updateBoard: vi.fn(),
  deleteBoard: vi.fn(),
  createColumn: vi.fn(),
  updateColumn: vi.fn(),
  moveColumn: vi.fn(),
  deleteColumn: vi.fn(),
}));

vi.mock("@/bindings", () => ({ commands }));

const board: Board = {
  id: "b1",
  projectId: "p1",
  name: "Sprint",
  createdAt: "2026-11-08T10:00:00Z",
  updatedAt: "2026-11-08T10:00:00Z",
};
const column: BoardColumn = {
  id: "c1",
  boardId: "b1",
  name: "To do",
  position: "a0",
  color: null,
  kind: "todo",
  createdAt: "2026-11-08T10:00:00Z",
  updatedAt: "2026-11-08T10:00:00Z",
  taskCount: 0,
};
const details: BoardDetails = { board, columns: [column] };
const payload = { code: "CONFLICT", message: "column still has tasks" };

describe("boards api", () => {
  beforeEach(() => {
    for (const command of Object.values(commands)) {
      command.mockReset();
    }
  });

  it("loads a board with its columns", async () => {
    commands.getBoard.mockResolvedValue({ status: "ok", data: details });

    await expect(fetchBoard("b1")).resolves.toEqual(details);

    expect(commands.getBoard).toHaveBeenCalledWith("b1");
  });

  it("creates a board with the given column names", async () => {
    commands.createBoard.mockResolvedValue({ status: "ok", data: details });
    const input: CreateBoardInput = {
      projectId: "p1",
      name: "Sprint",
      columns: [
        { name: "A fazer", kind: "todo" },
        { name: "Feito", kind: "done" },
      ],
    };

    await expect(createBoard(input)).resolves.toEqual(details);

    expect(commands.createBoard).toHaveBeenCalledWith(input);
  });

  it("can create a board without columns", async () => {
    commands.createBoard.mockResolvedValue({ status: "ok", data: { board, columns: [] } });

    await createBoard({ projectId: "p1", name: "Blank", columns: [] });

    expect(commands.createBoard).toHaveBeenCalledWith({
      projectId: "p1",
      name: "Blank",
      columns: [],
    });
  });

  it("renames a board", async () => {
    commands.updateBoard.mockResolvedValue({ status: "ok", data: board });

    await updateBoard("b1", { name: "New" });

    expect(commands.updateBoard).toHaveBeenCalledWith("b1", { name: "New" });
  });

  it("deletes a board", async () => {
    commands.deleteBoard.mockResolvedValue({ status: "ok", data: null });

    await expect(deleteBoard("b1")).resolves.toBeNull();

    expect(commands.deleteBoard).toHaveBeenCalledWith("b1");
  });

  it("creates a column", async () => {
    commands.createColumn.mockResolvedValue({ status: "ok", data: column });

    await createColumn({ boardId: "b1", name: "QA", color: "ember" });

    expect(commands.createColumn).toHaveBeenCalledWith({
      boardId: "b1",
      name: "QA",
      color: "ember",
    });
  });

  it("updates a column, sending null to clear its color", async () => {
    commands.updateColumn.mockResolvedValue({ status: "ok", data: column });

    await updateColumn("c1", { color: null });

    expect(commands.updateColumn).toHaveBeenCalledWith("c1", { color: null });
  });

  it("moves a column after another one or to the first place", async () => {
    commands.moveColumn.mockResolvedValue({ status: "ok", data: column });

    await moveColumn("c1", "c2");
    await moveColumn("c1", null);

    expect(commands.moveColumn).toHaveBeenNthCalledWith(1, "c1", "c2");
    expect(commands.moveColumn).toHaveBeenNthCalledWith(2, "c1", null);
  });

  it("deletes a column", async () => {
    commands.deleteColumn.mockResolvedValue({ status: "ok", data: null });

    await expect(deleteColumn("c1")).resolves.toBeNull();

    expect(commands.deleteColumn).toHaveBeenCalledWith("c1");
  });

  it.each([
    ["get", () => fetchBoard("b1"), "getBoard"],
    ["create board", () => createBoard({ projectId: "p1", name: "x" }), "createBoard"],
    ["update board", () => updateBoard("b1", {}), "updateBoard"],
    ["delete board", () => deleteBoard("b1"), "deleteBoard"],
    ["create column", () => createColumn({ boardId: "b1", name: "x" }), "createColumn"],
    ["update column", () => updateColumn("c1", {}), "updateColumn"],
    ["move column", () => moveColumn("c1", null), "moveColumn"],
    ["delete column", () => deleteColumn("c1"), "deleteColumn"],
  ] as const)(
    "rejects with the backend error payload when %s fails",
    async (_name, run, command) => {
      commands[command].mockResolvedValue({ status: "error", error: payload });

      await expect(run()).rejects.toBe(payload);
    },
  );
});
