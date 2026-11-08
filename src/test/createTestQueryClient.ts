import type { QueryClient } from "@tanstack/react-query";
import { createQueryClient } from "@/app/queryClient";

export function createTestQueryClient(): QueryClient {
  const queryClient = createQueryClient();
  queryClient.setDefaultOptions({
    ...queryClient.getDefaultOptions(),
    queries: { ...queryClient.getDefaultOptions().queries, retry: false, staleTime: 0 },
  });
  return queryClient;
}
