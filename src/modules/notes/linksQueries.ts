import { useQuery } from "@tanstack/react-query";
import { fetchNoteLinks } from "@/modules/notes/linksApi";

export const noteLinksKeys = {
  all: ["notes", "links"] as const,
  detail: (id: string) => ["notes", "links", id] as const,
};

export function useNoteLinks(id: string, isEnabled = true) {
  return useQuery({
    queryKey: noteLinksKeys.detail(id),
    queryFn: () => fetchNoteLinks(id),
    enabled: isEnabled,
  });
}
