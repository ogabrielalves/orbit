import { describe, expect, it } from "vitest";
import type { Task } from "@/bindings";
import { groupTasksByColumn } from "@/modules/tasks/grouping";
import { applyTaskMove, getTaskMove, shiftTaskCount } from "@/modules/tasks/moves";
import { createColumnFixture } from "@/test/boardFixture";
import { createTaskFixture } from "@/test/taskFixture";

function task(id: string, columnId: string, position: string): Task {
  return createTaskFixture({ id, title: id, columnId, position });
}

const tasks = [
  task("a", "c1", "a0"),
  task("b", "c1", "a1"),
  task("c", "c1", "a2"),
  task("x", "c2", "a0"),
  task("y", "c2", "a1"),
];
const groups = groupTasksByColumn(tasks);

describe("getTaskMove", () => {
  describe("inside one column", () => {
    it("moving down lands after the card it was dropped on", () => {
      expect(getTaskMove(groups, "a", { kind: "task", id: "c", isBelow: false })).toEqual({
        taskId: "a",
        columnId: "c1",
        afterTaskId: "c",
      });
    });

    it("moving up lands before the card it was dropped on", () => {
      expect(getTaskMove(groups, "c", { kind: "task", id: "a", isBelow: true })).toEqual({
        taskId: "c",
        columnId: "c1",
        afterTaskId: null,
      });
      expect(getTaskMove(groups, "c", { kind: "task", id: "b", isBelow: true })).toEqual({
        taskId: "c",
        columnId: "c1",
        afterTaskId: "a",
      });
    });

    it("does nothing when dropped on itself or already at the end of its column", () => {
      expect(getTaskMove(groups, "b", { kind: "task", id: "b", isBelow: false })).toBeNull();
      expect(getTaskMove(groups, "c", { kind: "column", id: "c1" })).toBeNull();
    });

    it("dropping on its own column sends the card to the end", () => {
      expect(getTaskMove(groups, "a", { kind: "column", id: "c1" })).toEqual({
        taskId: "a",
        columnId: "c1",
        afterTaskId: "c",
      });
    });
  });

  describe("to another column", () => {
    it("lands before the card when dropped on its upper half", () => {
      expect(getTaskMove(groups, "a", { kind: "task", id: "y", isBelow: false })).toEqual({
        taskId: "a",
        columnId: "c2",
        afterTaskId: "x",
      });
      expect(getTaskMove(groups, "a", { kind: "task", id: "x", isBelow: false })).toEqual({
        taskId: "a",
        columnId: "c2",
        afterTaskId: null,
      });
    });

    it("lands after the card when dropped on its lower half", () => {
      expect(getTaskMove(groups, "a", { kind: "task", id: "y", isBelow: true })).toEqual({
        taskId: "a",
        columnId: "c2",
        afterTaskId: "y",
      });
    });

    it("dropping on the column itself appends to the end", () => {
      expect(getTaskMove(groups, "a", { kind: "column", id: "c2" })).toEqual({
        taskId: "a",
        columnId: "c2",
        afterTaskId: "y",
      });
    });

    it("can fill an empty column", () => {
      expect(getTaskMove(groups, "a", { kind: "column", id: "c3" })).toEqual({
        taskId: "a",
        columnId: "c3",
        afterTaskId: null,
      });
    });
  });

  it("ignores unknown cards and unknown targets", () => {
    expect(getTaskMove(groups, "nope", { kind: "column", id: "c2" })).toBeNull();
    expect(getTaskMove(groups, "a", { kind: "task", id: "nope", isBelow: false })).toBeNull();
  });
});

describe("applyTaskMove", () => {
  function idsByColumn(result: Task[], columnId: string): string[] {
    return (groupTasksByColumn(result).get(columnId) ?? []).map((item) => item.id);
  }

  it("reorders inside a column", () => {
    const result = applyTaskMove(tasks, { taskId: "a", columnId: "c1", afterTaskId: "c" });

    expect(idsByColumn(result, "c1")).toEqual(["b", "c", "a"]);
    expect(idsByColumn(result, "c2")).toEqual(["x", "y"]);
  });

  it("moves a card to the top, the middle and the end of another column", () => {
    expect(
      idsByColumn(applyTaskMove(tasks, { taskId: "a", columnId: "c2", afterTaskId: null }), "c2"),
    ).toEqual(["a", "x", "y"]);
    expect(
      idsByColumn(applyTaskMove(tasks, { taskId: "a", columnId: "c2", afterTaskId: "x" }), "c2"),
    ).toEqual(["x", "a", "y"]);
    const atEnd = applyTaskMove(tasks, { taskId: "a", columnId: "c2", afterTaskId: "y" });
    expect(idsByColumn(atEnd, "c2")).toEqual(["x", "y", "a"]);
    expect(idsByColumn(atEnd, "c1")).toEqual(["b", "c"]);
  });

  it("changes the column of the moved card and keeps its other fields", () => {
    const result = applyTaskMove(tasks, { taskId: "a", columnId: "c2", afterTaskId: null });

    expect(result.find((item) => item.id === "a")).toMatchObject({
      columnId: "c2",
      title: "a",
    });
  });

  it("does not mutate the input and keeps every card", () => {
    const before = structuredClone(tasks);

    const result = applyTaskMove(tasks, { taskId: "a", columnId: "c2", afterTaskId: "x" });

    expect(tasks).toEqual(before);
    expect(result).toHaveLength(tasks.length);
  });

  it("returns the same list for an unknown card", () => {
    expect(applyTaskMove(tasks, { taskId: "nope", columnId: "c2", afterTaskId: null })).toBe(tasks);
  });

  it("appends when the anchor is unknown", () => {
    const result = applyTaskMove(tasks, { taskId: "a", columnId: "c2", afterTaskId: "ghost" });

    expect(idsByColumn(result, "c2")).toEqual(["x", "y", "a"]);
  });
});

describe("shiftTaskCount", () => {
  const columns = [
    createColumnFixture("c1", "One", { taskCount: 3 }),
    createColumnFixture("c2", "Two", { taskCount: 0 }),
  ];

  it("moves one task between the counters", () => {
    expect(shiftTaskCount(columns, "c1", "c2").map((column) => column.taskCount)).toEqual([2, 1]);
  });

  it("keeps the columns when the card stays in its column", () => {
    expect(shiftTaskCount(columns, "c1", "c1")).toBe(columns);
  });

  it("never goes below zero", () => {
    expect(shiftTaskCount(columns, "c2", "c1").map((column) => column.taskCount)).toEqual([4, 0]);
  });
});
