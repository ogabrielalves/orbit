import { useQuery } from "@tanstack/react-query";
import type { DashboardSummaryInput } from "@/bindings";
import { fetchDashboardSummary } from "@/modules/dashboard/api";

export const dashboardKeys = {
  all: ["dashboard"] as const,
  summary: (input: DashboardSummaryInput) => ["dashboard", "summary", input] as const,
};

export function useDashboardSummary(input: DashboardSummaryInput) {
  return useQuery({
    queryKey: dashboardKeys.summary(input),
    queryFn: () => fetchDashboardSummary(input),
    staleTime: 0,
  });
}
