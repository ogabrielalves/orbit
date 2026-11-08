import { useQuery } from "@tanstack/react-query";
import { fetchRecentActivity } from "@/modules/activity/api";

export const activityKeys = {
  all: ["activity"] as const,
  recent: (limit: number | null) => ["activity", "recent", limit] as const,
};

export function useRecentActivity(limit: number | null) {
  return useQuery({
    queryKey: activityKeys.recent(limit),
    queryFn: () => fetchRecentActivity(limit),
    staleTime: 0,
  });
}
