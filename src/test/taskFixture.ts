import type { Task } from "@/bindings";

export function createTaskFixture(overrides: Partial<Task> = {}): Task {
  return {
    id: "t1",
    projectId: "p1",
    boardId: "b1",
    columnId: "c1",
    parentTaskId: null,
    title: "Write the spec",
    description: "",
    priority: "medium",
    dueDate: null,
    position: "a0",
    createdAt: "2026-11-08T10:00:00Z",
    updatedAt: "2026-11-08T10:00:00Z",
    completedAt: null,
    archivedAt: null,
    ...overrides,
  };
}
