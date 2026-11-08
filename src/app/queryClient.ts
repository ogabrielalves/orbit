import { MutationCache, QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { i18next } from "@/i18n";
import { getErrorMessageKey } from "@/lib/appError";

export function notifyError(error: unknown): void {
  const messageKey = getErrorMessageKey(error);
  toast.error(i18next.t(messageKey));
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: 1,
        staleTime: 30_000,
        refetchOnWindowFocus: false,
      },
    },
    mutationCache: new MutationCache({ onError: notifyError }),
  });
}
