import { describe, expect, it } from "vitest";
import { parseProjectsSearch, resolveProjectsFilters } from "@/pages/projects/projectsSearch";

describe("parseProjectsSearch", () => {
  it("keeps valid values", () => {
    expect(
      parseProjectsSearch({
        q: "site",
        status: "paused",
        scope: "archived",
        sort: "name",
        view: "list",
      }),
    ).toEqual({ q: "site", status: "paused", scope: "archived", sort: "name", view: "list" });
  });

  it("drops unknown option values", () => {
    expect(
      parseProjectsSearch({ status: "done", scope: "all", sort: "random", view: "table" }),
    ).toEqual({
      q: undefined,
      status: undefined,
      scope: undefined,
      sort: undefined,
      view: undefined,
    });
  });

  it("drops values of the wrong type", () => {
    const parsed = parseProjectsSearch({ q: 42, status: ["active"], view: null });

    expect(parsed.q).toBeUndefined();
    expect(parsed.status).toBeUndefined();
    expect(parsed.view).toBeUndefined();
  });

  it("treats an empty query as no query", () => {
    expect(parseProjectsSearch({ q: "" }).q).toBeUndefined();
  });

  it("accepts an empty search", () => {
    expect(parseProjectsSearch({})).toEqual({
      q: undefined,
      status: undefined,
      scope: undefined,
      sort: undefined,
      view: undefined,
    });
  });
});

describe("resolveProjectsFilters", () => {
  it("fills every missing filter with its default", () => {
    expect(resolveProjectsFilters({})).toEqual({
      q: "",
      status: "all",
      scope: "active",
      sort: "updated",
      view: "grid",
    });
  });

  it("keeps the filters that were provided", () => {
    expect(resolveProjectsFilters({ status: "completed", view: "list", q: "app" })).toEqual({
      q: "app",
      status: "completed",
      scope: "active",
      sort: "updated",
      view: "list",
    });
  });
});
