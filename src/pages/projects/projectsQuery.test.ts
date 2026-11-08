import { describe, expect, it } from "vitest";
import { buildListInput, hasActiveFilters } from "@/pages/projects/projectsQuery";
import { type ProjectsFilters, resolveProjectsFilters } from "@/pages/projects/projectsSearch";

function filters(overrides: Partial<ProjectsFilters> = {}): ProjectsFilters {
  return { ...resolveProjectsFilters({}), ...overrides };
}

describe("buildListInput", () => {
  it("lists active projects of any status by default", () => {
    expect(buildListInput(filters())).toEqual({ scope: "active", status: null, search: null });
  });

  it("passes the archived scope", () => {
    expect(buildListInput(filters({ scope: "archived" })).scope).toBe("archived");
  });

  it("passes a specific status", () => {
    expect(buildListInput(filters({ status: "paused" })).status).toBe("paused");
  });

  it("passes the trimmed search text", () => {
    expect(buildListInput(filters({ q: "  site  " })).search).toBe("site");
  });

  it("sends no search for blank text", () => {
    expect(buildListInput(filters({ q: "   " })).search).toBeNull();
  });

  it("does not send view or sort, which are handled in the interface", () => {
    const input = buildListInput(filters({ sort: "name", view: "list" }));

    expect(input).not.toHaveProperty("sort");
    expect(input).not.toHaveProperty("view");
  });
});

describe("hasActiveFilters", () => {
  it("is false with the default filters", () => {
    expect(hasActiveFilters(filters())).toBe(false);
  });

  it("is true with search text or a status", () => {
    expect(hasActiveFilters(filters({ q: "app" }))).toBe(true);
    expect(hasActiveFilters(filters({ status: "completed" }))).toBe(true);
  });

  it("ignores blank search text", () => {
    expect(hasActiveFilters(filters({ q: "  " }))).toBe(false);
  });

  it("does not count scope, sort or view as filters", () => {
    expect(hasActiveFilters(filters({ scope: "archived", sort: "name", view: "list" }))).toBe(
      false,
    );
  });
});
