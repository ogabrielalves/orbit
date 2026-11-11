import { type QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { I18nextProvider } from "react-i18next";
import { Toaster } from "sonner";
import { createQueryClient } from "@/app/queryClient";
import { TooltipProvider } from "@/components/atoms/Tooltip";
import { i18next } from "@/i18n";

const defaultQueryClient = createQueryClient();

const toastClassNames = {
  toast: "flex w-[22rem] items-center gap-3 rounded-lg px-3.5 py-3 text-small shadow-toast",
  default: "bg-surface-inverse text-fg-on-inverse",
  success: "bg-surface-inverse text-fg-on-inverse",
  error: "border border-danger-border bg-surface text-fg",
  info: "border border-info-border bg-surface text-fg",
  actionButton: "font-semibold text-primary-border",
};

type ProvidersProps = {
  children: ReactNode;
  queryClient?: QueryClient;
};

export function Providers({ children, queryClient = defaultQueryClient }: ProvidersProps) {
  return (
    <I18nextProvider i18n={i18next}>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>{children}</TooltipProvider>
        <Toaster
          position="bottom-right"
          toastOptions={{ unstyled: true, classNames: toastClassNames }}
        />
      </QueryClientProvider>
    </I18nextProvider>
  );
}
