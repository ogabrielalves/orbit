import { describe, expect, it } from "vitest";
import type { BacklogItem } from "@/bindings";
import { applyBacklogMove, getBacklogMove } from "@/modules/backlog/moves";
import { createTaskFixture } from "@/test/taskFixture";

function item(id: string, projectId: string): BacklogItem {
  return {
    task: createTaskFixture({ id, projectId }),
    projectName: projectId,
    tags: [],
    subtaskCount: 0,
    subtasksDone: 0,
    checklistCount: 0,
    checklistDone: 0,
  };
}

const items = [item("a", "p1"), item("b", "p1"), item("c", "p1"), item("x", "p2"), item("y", "p2")];

function ids(list: BacklogItem[]): string[] {
  return list.map((entry) => entry.task.id);
}

describe("getBacklogMove", () => {
  it("places the task after the one it was dropped on when moving down", () => {
    expect(getBacklogMove(items, "a", "c")).toEqual({ taskId: "a", afterTaskId: "c" });
  });

  it("places the task before the one it was dropped on when moving up", () => {
    expect(getBacklogMove(items, "c", "b")).toEqual({ taskId: "c", afterTaskId: "a" });
  });

  it("uses null when the task goes to the top of its project", () => {
    expect(getBacklogMove(items, "c", "a")).toEqual({ taskId: "c", afterTaskId: null });
    expect(getBacklogMove(items, "y", "x")).toEqual({ taskId: "y", afterTaskId: null });
  });

  it("ignores drops on itself, unknown ids and other projects", () => {
    expect(getBacklogMove(items, "a", "a")).toBeNull();
    expect(getBacklogMove(items, "a", "zzz")).toBeNull();
    expect(getBacklogMove(items, "c", "x")).toBeNull();
  });
});

describe("applyBacklogMove", () => {
  it("moves the task after the anchor", () => {
    expect(ids(applyBacklogMove(items, "a", "c"))).toEqual(["b", "c", "a", "x", "y"]);
  });

  it("moves the task to the start of its own project when there is no anchor", () => {
    expect(ids(applyBacklogMove(items, "y", null))).toEqual(["a", "b", "c", "y", "x"]);
  });

  it("returns the same list when the task is unknown", () => {
    expect(applyBacklogMove(items, "zzz", null)).toBe(items);
  });
});
