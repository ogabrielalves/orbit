import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { SearchInput } from "@/bindings";
import { fetchSearch } from "@/modules/search/api";

export const searchKeys = {
  all: ["search"] as const,
  query: (input: SearchInput) => ["search", "query", input] as const,
};

export function useSearchResults(query: string, isEnabled = true) {
  const input: SearchInput = { query: query.trim() };
  const hasQuery = input.query !== "";

  return useQuery({
    queryKey: searchKeys.query(input),
    queryFn: () => fetchSearch(input),
    enabled: isEnabled && hasQuery,
    placeholderData: keepPreviousData,
    staleTime: 0,
  });
}
