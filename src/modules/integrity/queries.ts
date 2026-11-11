import { useQuery } from "@tanstack/react-query";
import { fetchDatabaseStatus } from "@/modules/integrity/api";

export const databaseStatusKeys = {
  all: ["database", "status"] as const,
};

export function useDatabaseStatus() {
  return useQuery({
    queryKey: databaseStatusKeys.all,
    queryFn: fetchDatabaseStatus,
    refetchInterval: (query) => (query.state.data?.state === "pending" ? 2000 : false),
  });
}
