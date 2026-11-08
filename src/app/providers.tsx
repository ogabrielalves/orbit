import * as RadixTooltip from "@radix-ui/react-tooltip";
import { QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { I18nextProvider } from "react-i18next";
import { Toaster } from "sonner";
import { createQueryClient } from "@/app/queryClient";
import { i18next } from "@/i18n";

const queryClient = createQueryClient();

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
};

export function Providers({ children }: ProvidersProps) {
  return (
    <I18nextProvider i18n={i18next}>
      <QueryClientProvider client={queryClient}>
        <RadixTooltip.Provider delayDuration={300}>{children}</RadixTooltip.Provider>
        <Toaster
          position="bottom-right"
          toastOptions={{ unstyled: true, classNames: toastClassNames }}
        />
      </QueryClientProvider>
    </I18nextProvider>
  );
}
