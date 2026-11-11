import type {
  Board,
  BoardColumn,
  BoardDetails,
  ColumnKind,
  CreateBoardInput,
  CreateColumnInput,
  UpdateBoardInput,
  UpdateColumnInput,
} from "@/bindings";
import { type Changes, type Recorder, track } from "./activity";
import { fail } from "./failure";
import { byPosition, placeAfter, previousSiblingId, rank, reposition } from "./ordering";
import type { Clock } from "./projects";
import type { State, StoredColumn } from "./state";
import { optionalText, requireText } from "./text";

const BOARD_NAME_MAX_LENGTH = 120;
const COLUMN_NAME_MAX_LENGTH = 60;
const MAX_COLUMNS_PER_BOARD = 30;

const DEFAULT_COLUMNS: { name: string; kind: ColumnKind }[] = [
  { name: "Backlog", kind: "todo" },
  { name: "To Do", kind: "todo" },
  { name: "In Progress", kind: "in_progress" },
  { name: "In Review", kind: "in_progress" },
  { name: "Done", kind: "done" },
];

export function createBoards(state: State, clock: Clock, record: Recorder) {
  function findBoard(id: string): Board {
    const board = state.boards.find((candidate) => candidate.id === id);
    if (board === undefined) {
      fail("NOT_FOUND", "board not found");
    }
    return board;
  }

  function findColumn(id: string): StoredColumn {
    const column = state.columns.find((candidate) => candidate.id === id);
    if (column === undefined) {
      fail("NOT_FOUND", "column not found");
    }
    return column;
  }

  function columnsOf(boardId: string): StoredColumn[] {
    return state.columns.filter((column) => column.boardId === boardId).sort(byPosition);
  }

  function countTasks(columnId: string): number {
    return state.tasks.filter(
      (task) =>
        task.columnId === columnId && task.archivedAt === null && task.parentTaskId === null,
    ).length;
  }

  function present(column: StoredColumn): BoardColumn {
    return { ...column, taskCount: countTasks(column.id) };
  }

  function details(boardId: string): BoardDetails {
    return {
      board: findBoard(boardId),
      columns: columnsOf(boardId).map(present),
    };
  }

  function newColumn(
    boardId: string,
    name: string,
    kind: ColumnKind,
    color: string | null,
    index: number,
  ): StoredColumn {
    const now = clock.now();
    return {
      id: clock.nextId("c"),
      boardId,
      name,
      position: rank(index),
      color,
      kind,
      createdAt: now,
      updatedAt: now,
    };
  }

  function create(input: CreateBoardInput): BoardDetails {
    const name = requireText("board name", input.name, BOARD_NAME_MAX_LENGTH);
    const requested = input.columns ?? DEFAULT_COLUMNS;
    if (requested.length > MAX_COLUMNS_PER_BOARD) {
      fail("VALIDATION", `a board cannot have more than ${MAX_COLUMNS_PER_BOARD} columns`);
    }
    const columnNames = requested.map((column) =>
      requireText("column name", column.name, COLUMN_NAME_MAX_LENGTH),
    );
    if (!state.projects.some((project) => project.id === input.projectId)) {
      fail("NOT_FOUND", "project not found");
    }
    const now = clock.now();
    const board: Board = {
      id: clock.nextId("b"),
      projectId: input.projectId,
      name,
      createdAt: now,
      updatedAt: now,
    };
    state.boards.push(board);
    requested.forEach((column, index) => {
      const created = newColumn(
        board.id,
        columnNames[index] ?? column.name,
        column.kind,
        null,
        index,
      );
      state.columns.push(created);
    });
    record("board", board.id, "created", { name: { from: null, to: board.name } });
    return details(board.id);
  }

  function update(id: string, input: UpdateBoardInput): Board {
    const current = findBoard(id);
    const name =
      input.name === undefined || input.name === null
        ? current.name
        : requireText("board name", input.name, BOARD_NAME_MAX_LENGTH);
    const changes: Changes = {};
    track(changes, "name", current.name, name);
    if (Object.keys(changes).length === 0) {
      return current;
    }
    current.name = name;
    current.updatedAt = clock.now();
    record("board", id, "updated", changes);
    return current;
  }

  function remove(id: string): null {
    const board = findBoard(id);
    const column = new Set(columnsOf(id).map((candidate) => candidate.id));
    const backlog = state.tasks
      .filter(
        (task) =>
          task.projectId === board.projectId &&
          task.columnId === null &&
          task.parentTaskId === null &&
          task.archivedAt === null,
      )
      .sort(byPosition);
    const detached = state.tasks.filter((task) => task.boardId === id).sort(byPosition);
    for (const task of detached) {
      task.boardId = null;
      task.columnId = null;
      task.completedAt = null;
      task.updatedAt = clock.now();
      if (task.parentTaskId === null && task.archivedAt === null) {
        backlog.push(task);
      }
      record("task", task.id, "moved", { board: { from: board.name, to: null } });
    }
    reposition(backlog);
    state.columns = state.columns.filter((candidate) => !column.has(candidate.id));
    state.boards = state.boards.filter((candidate) => candidate.id !== id);
    record("board", id, "deleted", { name: { from: board.name, to: null } });
    return null;
  }

  function createColumn(input: CreateColumnInput): BoardColumn {
    const name = requireText("column name", input.name, COLUMN_NAME_MAX_LENGTH);
    findBoard(input.boardId);
    const siblings = columnsOf(input.boardId);
    if (siblings.length >= MAX_COLUMNS_PER_BOARD) {
      fail("VALIDATION", `a board cannot have more than ${MAX_COLUMNS_PER_BOARD} columns`);
    }
    const column = newColumn(
      input.boardId,
      name,
      input.kind ?? "in_progress",
      optionalText(input.color),
      siblings.length,
    );
    state.columns.push(column);
    record("column", column.id, "created", {
      name: { from: null, to: column.name },
      kind: { from: null, to: column.kind },
    });
    return present(column);
  }

  function updateColumn(id: string, input: UpdateColumnInput): BoardColumn {
    const column = findColumn(id);
    const before = { ...column };
    if (input.name !== undefined && input.name !== null) {
      column.name = requireText("column name", input.name, COLUMN_NAME_MAX_LENGTH);
    }
    if (input.color !== undefined) {
      column.color = optionalText(input.color);
    }
    if (input.kind !== undefined && input.kind !== null) {
      column.kind = input.kind;
    }
    const changes: Changes = {};
    track(changes, "name", before.name, column.name);
    track(changes, "color", before.color, column.color);
    track(changes, "kind", before.kind, column.kind);
    if (Object.keys(changes).length === 0) {
      return present(column);
    }
    column.updatedAt = clock.now();
    record("column", id, "updated", changes);
    return present(column);
  }

  function moveColumn(id: string, afterColumnId: string | null): BoardColumn {
    const column = findColumn(id);
    const ordered = columnsOf(column.boardId);
    if (previousSiblingId(ordered, id) === afterColumnId) {
      return present(column);
    }
    const reordered = placeAfter(ordered, column, afterColumnId);
    reposition(reordered);
    column.updatedAt = clock.now();
    record("column", id, "moved");
    return present(column);
  }

  function deleteColumn(id: string): null {
    const column = findColumn(id);
    if (state.tasks.some((task) => task.columnId === id)) {
      fail("CONFLICT", "column still has tasks; move them to another column first");
    }
    state.columns = state.columns.filter((candidate) => candidate.id !== id);
    record("column", id, "deleted", { name: { from: column.name, to: null } });
    return null;
  }

  return { create, details, update, remove, createColumn, updateColumn, moveColumn, deleteColumn };
}
