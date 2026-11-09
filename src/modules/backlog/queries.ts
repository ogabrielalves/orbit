import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { BacklogItem, ListBacklogInput, Task } from "@/bindings";
import { fetchBacklog, fetchBacklogByProject, moveBacklogTask } from "@/modules/backlog/api";
import { applyBacklogMove } from "@/modules/backlog/moves";

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

type MoveBacklogVariables = { id: string; afterTaskId: string | null };
type MoveBacklogContext = { previous: [readonly unknown[], BacklogItem[] | undefined][] };

export function useMoveBacklogTask() {
  const queryClient = useQueryClient();
  const listKey = ["backlog", "list"] as const;

  return useMutation<Task, unknown, MoveBacklogVariables, MoveBacklogContext>({
    mutationFn: ({ id, afterTaskId }) => moveBacklogTask(id, afterTaskId),
    onMutate: async ({ id, afterTaskId }) => {
      await queryClient.cancelQueries({ queryKey: listKey });
      const previous = queryClient.getQueriesData<BacklogItem[]>({ queryKey: listKey });
      queryClient.setQueriesData<BacklogItem[]>({ queryKey: listKey }, (items) =>
        items === undefined ? items : applyBacklogMove(items, id, afterTaskId),
      );
      return { previous };
    },
    onError: (_error, _variables, context) => {
      for (const [key, items] of context?.previous ?? []) {
        queryClient.setQueryData(key, items);
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: backlogKeys.all }),
  });
}
