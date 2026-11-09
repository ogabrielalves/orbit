import { describe, expect, it } from "vitest";
import {
  buildCopyTitle,
  buildTaskUpdate,
  hasTaskChanges,
  toTaskFormValues,
} from "@/modules/tasks/form";
import { createTaskFixture } from "@/test/taskFixture";

const task = createTaskFixture({
  title: "Write the spec",
  description: "Draft it",
  priority: "medium",
  dueDate: "2026-11-09",
});

describe("toTaskFormValues", () => {
  it("copies the editable fields and turns a missing due date into an empty text", () => {
    expect(toTaskFormValues(task)).toEqual({
      title: "Write the spec",
      description: "Draft it",
      priority: "medium",
      dueDate: "2026-11-09",
    });
    expect(toTaskFormValues(createTaskFixture({ dueDate: null })).dueDate).toBe("");
  });
});

describe("buildTaskUpdate", () => {
  it("is empty when nothing changed, even with stray spaces", () => {
    const values = {
      ...toTaskFormValues(task),
      title: "  Write the spec ",
      description: "Draft it\n",
    };

    expect(buildTaskUpdate(task, values)).toEqual({});
    expect(hasTaskChanges(task, values)).toBe(false);
  });

  it("sends only the fields that changed", () => {
    const values = {
      ...toTaskFormValues(task),
      priority: "urgent" as const,
      title: "Ship the spec",
    };

    expect(buildTaskUpdate(task, values)).toEqual({ title: "Ship the spec", priority: "urgent" });
    expect(hasTaskChanges(task, values)).toBe(true);
  });

  it("sends null to clear the due date and a day to set it", () => {
    expect(buildTaskUpdate(task, { ...toTaskFormValues(task), dueDate: "" })).toEqual({
      dueDate: null,
    });
    expect(
      buildTaskUpdate(createTaskFixture({ dueDate: null }), {
        ...toTaskFormValues(task),
        dueDate: "2026-12-01",
        title: task.title,
        description: "",
        priority: "medium",
      }),
    ).toEqual({ dueDate: "2026-12-01" });
  });

  it("does not touch the due date when it was empty and stays empty", () => {
    const withoutDate = createTaskFixture({ dueDate: null });

    expect(buildTaskUpdate(withoutDate, toTaskFormValues(withoutDate))).toEqual({});
  });

  it("clears the description when it is emptied", () => {
    expect(buildTaskUpdate(task, { ...toTaskFormValues(task), description: "  " })).toEqual({
      description: "",
    });
  });
});

describe("buildCopyTitle", () => {
  const translate = (title: string) => `${title} (copy)`;

  it("adds the suffix", () => {
    expect(buildCopyTitle("Write the spec", translate)).toBe("Write the spec (copy)");
  });

  it("shortens the title so the copy still fits the limit", () => {
    const copy = buildCopyTitle("x".repeat(200), translate);

    expect(copy).toHaveLength(200);
    expect(copy.endsWith(" (copy)")).toBe(true);
  });
});
