import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { ListBacklogInput } from "@/bindings";
import { fetchBacklog, fetchBacklogByProject } from "@/modules/backlog/api";

export const backlogKeys = {
  all: ["backlog"] as const,
  list: (input: ListBacklogInput) => ["backlog", "list", input] as const,
  grouped: (input: ListBacklogInput) => ["backlog", "grouped", input] as const,
};

export function useBacklog(input: ListBacklogInput, isEnabled = true) {
  return useQuery({
    queryKey: backlogKeys.list(input),
    queryFn: () => fetchBacklog(input),
    placeholderData: keepPreviousData,
    enabled: isEnabled,
  });
}

export function useBacklogByProject(input: ListBacklogInput, isEnabled = true) {
  return useQuery({
    queryKey: backlogKeys.grouped(input),
    queryFn: () => fetchBacklogByProject(input),
    placeholderData: keepPreviousData,
    enabled: isEnabled,
  });
}
