import type { ListProjectsInput } from "@/bindings";
import type { ProjectsFilters } from "@/pages/projects/projectsSearch";

export function buildListInput(filters: ProjectsFilters): ListProjectsInput {
  const { status, scope } = filters;
  const isAnyStatus = status === "all";
  const trimmedQuery = filters.q.trim();
  const hasQuery = trimmedQuery !== "";

  return {
    scope,
    status: isAnyStatus ? null : status,
    search: hasQuery ? trimmedQuery : null,
  };
}

export function hasActiveFilters(filters: ProjectsFilters): boolean {
  const hasQuery = filters.q.trim() !== "";
  const hasStatus = filters.status !== "all";
  return hasQuery || hasStatus;
}
