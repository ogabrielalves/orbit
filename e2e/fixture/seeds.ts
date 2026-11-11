import type { ColumnKind, Project, Task } from "@/bindings";
import { rank } from "./ordering";
import type { Seed, StoredColumn } from "./state";

export const onboardedSeed: Seed = {
  settings: { language: "en", vaultPath: "/home/me/orbit", userName: "Gabriel" },
};

export function projectFixture(overrides: Partial<Project> = {}): Project {
  return {
    id: "seed-p1",
    name: "Website 2.0",
    description: "Redesign of the marketing site",
    icon: null,
    color: "orbit",
    status: "active",
    createdAt: "2026-11-01T10:00:00.000Z",
    updatedAt: "2026-11-01T10:00:00.000Z",
    archivedAt: null,
    ...overrides,
  };
}

export const boardIds = { project: "seed-p1", board: "seed-b1" } as const;

function seededColumn(id: string, name: string, kind: ColumnKind, index: number): StoredColumn {
  return {
    id,
    boardId: boardIds.board,
    name,
    position: rank(index),
    color: null,
    kind,
    createdAt: "2026-11-02T10:00:00.000Z",
    updatedAt: "2026-11-02T10:00:00.000Z",
  };
}

export function taskFixture(
  id: string,
  title: string,
  columnId: string | null,
  index: number,
  overrides: Partial<Task> = {},
): Task {
  return {
    id,
    projectId: boardIds.project,
    boardId: columnId === null ? null : boardIds.board,
    columnId,
    parentTaskId: null,
    title,
    description: "",
    priority: "medium",
    dueDate: null,
    position: rank(index),
    createdAt: "2026-11-02T10:00:00.000Z",
    updatedAt: "2026-11-02T10:00:00.000Z",
    completedAt: null,
    archivedAt: null,
    ...overrides,
  };
}

export const boardSeed: Seed = {
  ...onboardedSeed,
  projects: [projectFixture({ id: boardIds.project, name: "Website 2.0" })],
  boards: [
    {
      id: boardIds.board,
      projectId: boardIds.project,
      name: "Sprint 1",
      createdAt: "2026-11-02T10:00:00.000Z",
      updatedAt: "2026-11-02T10:00:00.000Z",
    },
  ],
  columns: [
    seededColumn("seed-c1", "To Do", "todo", 0),
    seededColumn("seed-c2", "In Progress", "in_progress", 1),
    seededColumn("seed-c3", "Done", "done", 2),
  ],
  tasks: [
    taskFixture("seed-t1", "Write the spec", "seed-c1", 0),
    taskFixture("seed-t2", "Design the logo", "seed-c1", 1),
    taskFixture("seed-t3", "Review copy", "seed-c2", 0),
  ],
};
