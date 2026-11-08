import type { Project } from "@/bindings";

export type ProjectSortKey = "updated" | "name" | "created";

export function sortProjects(projects: Project[], sort: ProjectSortKey, locale: string): Project[] {
  const collator = new Intl.Collator(locale, { sensitivity: "base", numeric: true });

  const comparators: Record<ProjectSortKey, (first: Project, second: Project) => number> = {
    updated: (first, second) => second.updatedAt.localeCompare(first.updatedAt),
    created: (first, second) => second.createdAt.localeCompare(first.createdAt),
    name: (first, second) => collator.compare(first.name, second.name),
  };

  return [...projects].sort(comparators[sort]);
}
