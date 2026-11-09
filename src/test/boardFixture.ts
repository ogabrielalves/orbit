import type { BoardColumn, BoardDetails } from "@/bindings";

export function createColumnFixture(
  id: string,
  name: string,
  overrides: Partial<BoardColumn> = {},
): BoardColumn {
  return {
    id,
    boardId: "b1",
    name,
    position: id,
    color: null,
    kind: "todo",
    createdAt: "2026-11-08T10:00:00Z",
    updatedAt: "2026-11-08T10:00:00Z",
    taskCount: 0,
    ...overrides,
  };
}

export function createBoardDetailsFixture(overrides: Partial<BoardDetails> = {}): BoardDetails {
  return {
    board: {
      id: "b1",
      projectId: "p1",
      name: "Sprint 14",
      createdAt: "2026-11-01T10:00:00Z",
      updatedAt: "2026-11-01T10:00:00Z",
    },
    columns: [
      createColumnFixture("c1", "To do", { taskCount: 2 }),
      createColumnFixture("c2", "In progress", { taskCount: 3, color: "ember" }),
      createColumnFixture("c3", "Done"),
    ],
    ...overrides,
  };
}
