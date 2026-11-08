import type { ReactNode } from "react";

type PageHeaderProps = {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
};

export function PageHeader({ title, subtitle, actions }: PageHeaderProps) {
  const hasSubtitle = subtitle !== undefined;
  const hasActions = actions !== undefined;

  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex flex-col gap-1">
        {hasSubtitle && <span className="text-small text-fg-muted">{subtitle}</span>}
        <h1 className="font-display text-heading-1 font-semibold text-fg">{title}</h1>
      </div>
      {hasActions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
