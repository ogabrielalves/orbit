export const projectStatusFilters = ["all", "active", "paused", "completed"] as const;
export const projectScopes = ["active", "archived"] as const;
export const projectSorts = ["updated", "name", "created"] as const;
export const projectViews = ["grid", "list"] as const;

export type ProjectStatusFilter = (typeof projectStatusFilters)[number];
export type ProjectScope = (typeof projectScopes)[number];
export type ProjectSort = (typeof projectSorts)[number];
export type ProjectView = (typeof projectViews)[number];

export type ProjectsSearch = {
  q?: string;
  status?: ProjectStatusFilter;
  scope?: ProjectScope;
  sort?: ProjectSort;
  view?: ProjectView;
};

export type ProjectsFilters = Required<ProjectsSearch>;

function pickOption<TOption extends string>(
  options: readonly TOption[],
  value: unknown,
): TOption | undefined {
  const isOption = options.includes(value as TOption);
  return isOption ? (value as TOption) : undefined;
}

function pickText(value: unknown): string | undefined {
  const isText = typeof value === "string";
  return isText && value !== "" ? value : undefined;
}

export function parseProjectsSearch(raw: Record<string, unknown>): ProjectsSearch {
  return {
    q: pickText(raw.q),
    status: pickOption(projectStatusFilters, raw.status),
    scope: pickOption(projectScopes, raw.scope),
    sort: pickOption(projectSorts, raw.sort),
    view: pickOption(projectViews, raw.view),
  };
}

export function resolveProjectsFilters(search: ProjectsSearch): ProjectsFilters {
  return {
    q: search.q ?? "",
    status: search.status ?? "all",
    scope: search.scope ?? "active",
    sort: search.sort ?? "updated",
    view: search.view ?? "grid",
  };
}
