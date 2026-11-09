import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { activityKeys } from "@/modules/activity/queries";
import { createComment, deleteComment, fetchComments, updateComment } from "@/modules/comments/api";

export const commentKeys = {
  all: ["comments"] as const,
  task: (taskId: string) => ["comments", "task", taskId] as const,
};

type UpdateCommentVariables = { id: string; body: string };

export function useComments(taskId: string, isEnabled = true) {
  return useQuery({
    queryKey: commentKeys.task(taskId),
    queryFn: () => fetchComments(taskId),
    enabled: isEnabled,
  });
}

function useInvalidateComments(taskId: string) {
  const queryClient = useQueryClient();

  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: commentKeys.task(taskId) }),
      queryClient.invalidateQueries({ queryKey: activityKeys.all }),
    ]);
}

export function useCreateComment(taskId: string) {
  const invalidateComments = useInvalidateComments(taskId);

  return useMutation({
    mutationFn: (body: string) => createComment({ taskId, body }),
    onSuccess: invalidateComments,
  });
}

export function useUpdateComment(taskId: string) {
  const invalidateComments = useInvalidateComments(taskId);

  return useMutation({
    mutationFn: ({ id, body }: UpdateCommentVariables) => updateComment(id, body),
    onSuccess: invalidateComments,
  });
}

export function useDeleteComment(taskId: string) {
  const invalidateComments = useInvalidateComments(taskId);

  return useMutation({
    mutationFn: (id: string) => deleteComment(id),
    onSuccess: invalidateComments,
  });
}
