import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ChecklistItem, UpdateChecklistItemInput } from "@/bindings";
import { applyReorder, type Reorder } from "@/lib/reorder";
import { activityKeys } from "@/modules/activity/queries";
import {
  createChecklistItem,
  deleteChecklistItem,
  fetchChecklist,
  moveChecklistItem,
  updateChecklistItem,
} from "@/modules/checklist/api";

export const checklistKeys = {
  all: ["checklist"] as const,
  task: (taskId: string) => ["checklist", "task", taskId] as const,
};

type UpdateChecklistItemVariables = { id: string; input: UpdateChecklistItemInput };
type MoveChecklistItemContext = { previous: ChecklistItem[] | undefined };

export function useChecklist(taskId: string, isEnabled = true) {
  return useQuery({
    queryKey: checklistKeys.task(taskId),
    queryFn: () => fetchChecklist(taskId),
    enabled: isEnabled,
  });
}

function useInvalidateChecklist(taskId: string) {
  const queryClient = useQueryClient();

  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: checklistKeys.task(taskId) }),
      queryClient.invalidateQueries({ queryKey: activityKeys.all }),
    ]);
}

export function useCreateChecklistItem(taskId: string) {
  const invalidateChecklist = useInvalidateChecklist(taskId);

  return useMutation({
    mutationFn: (text: string) => createChecklistItem({ taskId, text }),
    onSuccess: invalidateChecklist,
  });
}

export function useUpdateChecklistItem(taskId: string) {
  const invalidateChecklist = useInvalidateChecklist(taskId);

  return useMutation({
    mutationFn: ({ id, input }: UpdateChecklistItemVariables) => updateChecklistItem(id, input),
    onSuccess: invalidateChecklist,
  });
}

export function useDeleteChecklistItem(taskId: string) {
  const invalidateChecklist = useInvalidateChecklist(taskId);

  return useMutation({
    mutationFn: (id: string) => deleteChecklistItem(id),
    onSuccess: invalidateChecklist,
  });
}

export function useMoveChecklistItem(taskId: string) {
  const queryClient = useQueryClient();
  const invalidateChecklist = useInvalidateChecklist(taskId);
  const queryKey = checklistKeys.task(taskId);

  return useMutation<ChecklistItem, unknown, Reorder, MoveChecklistItemContext>({
    mutationFn: ({ id, afterId }) => moveChecklistItem(id, afterId),
    onMutate: async (reorder) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<ChecklistItem[]>(queryKey);

      const hasPrevious = previous !== undefined;
      if (hasPrevious) {
        queryClient.setQueryData<ChecklistItem[]>(queryKey, applyReorder(previous, reorder));
      }

      return { previous };
    },
    onError: (_error, _variables, context) => {
      const hasSnapshot = context?.previous !== undefined;
      if (hasSnapshot) {
        queryClient.setQueryData(queryKey, context.previous);
      }
    },
    onSettled: invalidateChecklist,
  });
}
