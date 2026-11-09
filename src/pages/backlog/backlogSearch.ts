import type { BacklogSort, ListBacklogInput, TaskPriority } from "@/bindings";

export const backlogSorts = ["manual", "priority", "due_date", "created", "title"] as const;
export const backlogPriorities = ["low", "medium", "high", "urgent"] as const;

export type BacklogSearch = {
  q?: string;
  project?: string;
  priority?: TaskPriority;
  tag?: string;
  sort?: BacklogSort;
  grouped?: boolean;
  task?: string;
};

export type BacklogFilters = {
  q: string;
  project: string;
  priority: TaskPriority | "";
  tag: string;
  sort: BacklogSort;
  grouped: boolean;
};

function pickText(value: unknown): string | undefined {
  const isText = typeof value === "string";
  return isText && value !== "" ? value : undefined;
}

function pickOption<TOption extends string>(
  options: readonly TOption[],
  value: unknown,
): TOption | undefined {
  const isOption = options.includes(value as TOption);
  return isOption ? (value as TOption) : undefined;
}

export function parseBacklogSearch(raw: Record<string, unknown>): BacklogSearch {
  const isGrouped = raw.grouped === true || raw.grouped === "true";
  return {
    q: pickText(raw.q),
    project: pickText(raw.project),
    priority: pickOption(backlogPriorities, raw.priority),
    tag: pickText(raw.tag),
    sort: pickOption(backlogSorts, raw.sort),
    grouped: isGrouped ? true : undefined,
    task: pickText(raw.task),
  };
}

export function resolveBacklogFilters(search: BacklogSearch): BacklogFilters {
  return {
    q: search.q ?? "",
    project: search.project ?? "",
    priority: search.priority ?? "",
    tag: search.tag ?? "",
    sort: search.sort ?? "manual",
    grouped: search.grouped ?? false,
  };
}

export function hasActiveBacklogFilters(filters: BacklogFilters): boolean {
  return (
    filters.q.trim() !== "" ||
    filters.project !== "" ||
    filters.priority !== "" ||
    filters.tag !== ""
  );
}

export function buildBacklogInput(filters: BacklogFilters): ListBacklogInput {
  const query = filters.q.trim();
  return {
    projectId: filters.project === "" ? null : filters.project,
    priority: filters.priority === "" ? null : filters.priority,
    tagId: filters.tag === "" ? null : filters.tag,
    search: query === "" ? null : query,
    sort: filters.sort,
  };
}
