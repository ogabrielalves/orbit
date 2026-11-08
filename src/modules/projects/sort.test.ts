import { describe, expect, it } from "vitest";
import type { Project } from "@/bindings";
import { sortProjects } from "@/modules/projects/sort";

function createProject(id: string, name: string, createdAt: string, updatedAt: string): Project {
  return {
    id,
    name,
    description: "",
    icon: null,
    color: null,
    status: "active",
    createdAt,
    updatedAt,
    archivedAt: null,
  };
}

const projects = [
  createProject("1", "banana", "2026-01-01T00:00:00Z", "2026-03-01T00:00:00Z"),
  createProject("2", "Álamo", "2026-03-01T00:00:00Z", "2026-01-01T00:00:00Z"),
  createProject("3", "cereja", "2026-02-01T00:00:00Z", "2026-02-01T00:00:00Z"),
];

function ids(sorted: Project[]): string[] {
  return sorted.map((project) => project.id);
}

describe("sortProjects", () => {
  it("puts the most recently updated first", () => {
    expect(ids(sortProjects(projects, "updated", "pt-BR"))).toEqual(["1", "3", "2"]);
  });

  it("puts the most recently created first", () => {
    expect(ids(sortProjects(projects, "created", "pt-BR"))).toEqual(["2", "3", "1"]);
  });

  it("sorts by name ignoring case and accents", () => {
    expect(ids(sortProjects(projects, "name", "pt-BR"))).toEqual(["2", "1", "3"]);
  });

  it("sorts numbers inside names naturally", () => {
    const numbered = [
      createProject("a", "Sprint 10", "2026-01-01T00:00:00Z", "2026-01-01T00:00:00Z"),
      createProject("b", "Sprint 2", "2026-01-01T00:00:00Z", "2026-01-01T00:00:00Z"),
    ];

    expect(ids(sortProjects(numbered, "name", "en"))).toEqual(["b", "a"]);
  });

  it("does not change the original list", () => {
    const original = [...projects];

    sortProjects(projects, "name", "pt-BR");

    expect(projects).toEqual(original);
  });

  it("handles an empty list", () => {
    expect(sortProjects([], "name", "pt-BR")).toEqual([]);
  });
});
