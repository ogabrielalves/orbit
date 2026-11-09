import { describe, expect, it } from "vitest";
import {
  buildBacklogInput,
  hasActiveBacklogFilters,
  parseBacklogSearch,
  resolveBacklogFilters,
} from "@/pages/backlog/backlogSearch";

describe("parseBacklogSearch", () => {
  it("keeps valid values", () => {
    expect(
      parseBacklogSearch({
        q: "spec",
        project: "p1",
        priority: "urgent",
        tag: "g1",
        sort: "title",
        grouped: "true",
        task: "t1",
      }),
    ).toEqual({
      q: "spec",
      project: "p1",
      priority: "urgent",
      tag: "g1",
      sort: "title",
      grouped: true,
      task: "t1",
    });
  });

  it("drops invalid and empty values", () => {
    expect(
      parseBacklogSearch({ q: "", priority: "nope", sort: "random", grouped: "false", task: 3 }),
    ).toEqual({
      q: undefined,
      project: undefined,
      priority: undefined,
      tag: undefined,
      sort: undefined,
      grouped: undefined,
      task: undefined,
    });
  });
});

describe("resolveBacklogFilters", () => {
  it("falls back to the defaults", () => {
    expect(resolveBacklogFilters({})).toEqual({
      q: "",
      project: "",
      priority: "",
      tag: "",
      sort: "manual",
      grouped: false,
    });
  });
});

describe("hasActiveBacklogFilters", () => {
  it("ignores sort and grouping", () => {
    const filters = resolveBacklogFilters({ sort: "title", grouped: true });

    expect(hasActiveBacklogFilters(filters)).toBe(false);
  });

  it("detects any narrowing filter", () => {
    expect(hasActiveBacklogFilters(resolveBacklogFilters({ priority: "low" }))).toBe(true);
    expect(hasActiveBacklogFilters(resolveBacklogFilters({ q: "  " }))).toBe(false);
  });
});

describe("buildBacklogInput", () => {
  it("sends null for unset filters and trims the search", () => {
    const filters = resolveBacklogFilters({ q: " spec ", priority: "high" });

    expect(buildBacklogInput(filters)).toEqual({
      projectId: null,
      priority: "high",
      tagId: null,
      search: "spec",
      sort: "manual",
    });
  });
});
