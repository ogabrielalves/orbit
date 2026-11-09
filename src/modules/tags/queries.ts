import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateTagInput } from "@/bindings";
import { activityKeys } from "@/modules/activity/queries";
import { assignTag, createTag, fetchTags, fetchTaskTags, unassignTag } from "@/modules/tags/api";

export const tagKeys = {
  all: ["tags"] as const,
  list: ["tags", "list"] as const,
  task: (taskId: string) => ["tags", "task", taskId] as const,
};

type TagAssignment = { taskId: string; tagId: string };

export function useTags() {
  return useQuery({
    queryKey: tagKeys.list,
    queryFn: fetchTags,
  });
}

export function useTaskTags(taskId: string, isEnabled = true) {
  return useQuery({
    queryKey: tagKeys.task(taskId),
    queryFn: () => fetchTaskTags(taskId),
    enabled: isEnabled,
  });
}

export function useCreateTag() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateTagInput) => createTag(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: tagKeys.list }),
  });
}

function useInvalidateAssignments() {
  const queryClient = useQueryClient();

  return (taskId: string) =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: tagKeys.task(taskId) }),
      queryClient.invalidateQueries({ queryKey: tagKeys.list }),
      queryClient.invalidateQueries({ queryKey: activityKeys.all }),
    ]);
}

export function useAssignTag() {
  const invalidateAssignments = useInvalidateAssignments();

  return useMutation({
    mutationFn: ({ taskId, tagId }: TagAssignment) => assignTag(taskId, tagId),
    onSuccess: (_data, { taskId }) => invalidateAssignments(taskId),
  });
}

export function useUnassignTag() {
  const invalidateAssignments = useInvalidateAssignments();

  return useMutation({
    mutationFn: ({ taskId, tagId }: TagAssignment) => unassignTag(taskId, tagId),
    onSuccess: (_data, { taskId }) => invalidateAssignments(taskId),
  });
}
