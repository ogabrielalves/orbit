import type { ReactNode } from "react";
import { MAIN_CONTENT_ID } from "@/components/molecules/SkipLink";

type AppShellProps = {
  sidebar: ReactNode;
  topbar: ReactNode;
  children: ReactNode;
};

export function AppShell({ sidebar, topbar, children }: AppShellProps) {
  return (
    <div className="flex min-h-full bg-canvas text-fg">
      {sidebar}
      <div className="flex min-w-0 flex-1 flex-col">
        {topbar}
        <main
          id={MAIN_CONTENT_ID}
          tabIndex={-1}
          className="mx-auto flex w-full max-w-content flex-1 flex-col gap-6 px-4 py-6 md:px-6 lg:px-8 lg:py-8 outline-none focus-visible:shadow-none"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
