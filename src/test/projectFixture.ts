import type { Project } from "@/bindings";

export function createProjectFixture(overrides: Partial<Project> = {}): Project {
  return {
    id: "p1",
    name: "Website 2.0",
    description: "Redesign of the company site.",
    icon: null,
    color: "orbit",
    status: "active",
    createdAt: "2026-09-02T12:00:00Z",
    updatedAt: "2026-11-08T12:00:00Z",
    archivedAt: null,
    ...overrides,
  };
}
