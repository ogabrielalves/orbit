import { describe, expect, it } from "vitest";
import { groupTasksByColumn } from "@/modules/tasks/grouping";
import { createTaskFixture } from "@/test/taskFixture";

describe("groupTasksByColumn", () => {
  it("groups the tasks by column", () => {
    const groups = groupTasksByColumn([
      createTaskFixture({ id: "t1", columnId: "c1", position: "a0" }),
      createTaskFixture({ id: "t2", columnId: "c2", position: "a0" }),
      createTaskFixture({ id: "t3", columnId: "c1", position: "a1" }),
    ]);

    expect([...groups.keys()]).toEqual(["c1", "c2"]);
    expect(groups.get("c1")?.map((task) => task.id)).toEqual(["t1", "t3"]);
    expect(groups.get("c2")?.map((task) => task.id)).toEqual(["t2"]);
  });

  it("orders each column by position, whatever the input order", () => {
    const groups = groupTasksByColumn([
      createTaskFixture({ id: "t1", position: "a2" }),
      createTaskFixture({ id: "t2", position: "a0" }),
      createTaskFixture({ id: "t3", position: "a1" }),
    ]);

    expect(groups.get("c1")?.map((task) => task.id)).toEqual(["t2", "t3", "t1"]);
  });

  it("breaks position ties by id like the backend", () => {
    const groups = groupTasksByColumn([
      createTaskFixture({ id: "b", position: "a0" }),
      createTaskFixture({ id: "a", position: "a0" }),
    ]);

    expect(groups.get("c1")?.map((task) => task.id)).toEqual(["a", "b"]);
  });

  it("compares positions as plain text, not as numbers", () => {
    const groups = groupTasksByColumn([
      createTaskFixture({ id: "t1", position: "a10" }),
      createTaskFixture({ id: "t2", position: "a2" }),
    ]);

    expect(groups.get("c1")?.map((task) => task.id)).toEqual(["t1", "t2"]);
  });

  it("ignores tasks that are not in a column and does not mutate the input", () => {
    const tasks = [
      createTaskFixture({ id: "t1", columnId: null }),
      createTaskFixture({ id: "t2", position: "a1" }),
      createTaskFixture({ id: "t3", position: "a0" }),
    ];

    const groups = groupTasksByColumn(tasks);

    expect(groups.size).toBe(1);
    expect(tasks.map((task) => task.id)).toEqual(["t1", "t2", "t3"]);
  });
});
