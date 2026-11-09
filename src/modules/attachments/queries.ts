import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { activityKeys } from "@/modules/activity/queries";
import {
  fetchAttachments,
  importAttachment,
  openAttachment,
  removeAttachment,
} from "@/modules/attachments/api";

export const attachmentKeys = {
  all: ["attachments"] as const,
  task: (taskId: string) => ["attachments", "task", taskId] as const,
};

type ImportAttachmentVariables = { taskId: string; sourcePath: string };

export function useAttachments(taskId: string, isEnabled = true) {
  return useQuery({
    queryKey: attachmentKeys.task(taskId),
    queryFn: () => fetchAttachments(taskId),
    enabled: isEnabled,
  });
}

function useInvalidateAttachments(taskId: string) {
  const queryClient = useQueryClient();

  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: attachmentKeys.task(taskId) }),
      queryClient.invalidateQueries({ queryKey: activityKeys.all }),
    ]);
}

export function useImportAttachment(taskId: string) {
  const invalidateAttachments = useInvalidateAttachments(taskId);

  return useMutation({
    mutationFn: ({ taskId: target, sourcePath }: ImportAttachmentVariables) =>
      importAttachment(target, sourcePath),
    onSuccess: invalidateAttachments,
  });
}

export function useRemoveAttachment(taskId: string) {
  const invalidateAttachments = useInvalidateAttachments(taskId);

  return useMutation({
    mutationFn: (id: string) => removeAttachment(id),
    onSuccess: invalidateAttachments,
  });
}

export function useOpenAttachment() {
  return useMutation({
    mutationFn: (id: string) => openAttachment(id),
  });
}
