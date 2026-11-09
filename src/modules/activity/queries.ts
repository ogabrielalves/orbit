import { useQuery } from "@tanstack/react-query";
import { fetchRecentActivity, fetchTaskHistory } from "@/modules/activity/api";

export const activityKeys = {
  all: ["activity"] as const,
  task: (taskId: string) => ["activity", "task", taskId] as const,
  recent: (limit: number | null) => ["activity", "recent", limit] as const,
};

export function useRecentActivity(limit: number | null) {
  return useQuery({
    queryKey: activityKeys.recent(limit),
    queryFn: () => fetchRecentActivity(limit),
    staleTime: 0,
  });
}

export function useTaskHistory(taskId: string, isEnabled = true) {
  return useQuery({
    queryKey: activityKeys.task(taskId),
    queryFn: () => fetchTaskHistory(taskId, null),
    staleTime: 0,
    enabled: isEnabled,
  });
}
