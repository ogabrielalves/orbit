import type { ReactNode } from "react";

type DashboardCardProps = {
  title: string;
  action?: ReactNode;
  children: ReactNode;
};

export function DashboardCard({ title, action, children }: DashboardCardProps) {
  const hasAction = action !== undefined;

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-heading-3 font-semibold text-fg">{title}</h2>
        {hasAction && <div className="text-small font-medium">{action}</div>}
      </div>
      {children}
    </section>
  );
}
