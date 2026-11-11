import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { GraphInput, LocalGraphInput } from "@/bindings";
import { fetchGraph, fetchLocalGraph } from "@/modules/graph/api";

export const graphKeys = {
  all: ["notes", "graph"] as const,
  full: (input: GraphInput) => ["notes", "graph", "full", input] as const,
  local: (input: LocalGraphInput) => ["notes", "graph", "local", input] as const,
};

export function useGraph(includeUnresolved: boolean) {
  const input: GraphInput = { includeUnresolved };

  return useQuery({
    queryKey: graphKeys.full(input),
    queryFn: () => fetchGraph(input),
    placeholderData: keepPreviousData,
  });
}

export function useLocalGraph(noteId: string, depth: number, includeUnresolved: boolean) {
  const input: LocalGraphInput = { noteId, depth, includeUnresolved };

  return useQuery({
    queryKey: graphKeys.local(input),
    queryFn: () => fetchLocalGraph(input),
    placeholderData: keepPreviousData,
  });
}
