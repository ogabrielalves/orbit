import { useQuery } from "@tanstack/react-query";
import { noteKeys } from "@/modules/notes/queries";
import { fetchRecentNotes } from "@/modules/notes/recentApi";

export const recentNotesKeys = {
  list: (limit: number | null) => [...noteKeys.all, "recent", limit] as const,
};

export function useRecentNotes(limit: number | null) {
  return useQuery({
    queryKey: recentNotesKeys.list(limit),
    queryFn: () => fetchRecentNotes(limit),
    staleTime: 0,
  });
}
