import type { ReactNode } from "react";

type PageHeaderVariant = "default" | "display";

type PageHeaderProps = {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  variant?: PageHeaderVariant;
};

const titleClasses: Record<PageHeaderVariant, string> = {
  default: "text-heading-1",
  display: "text-title",
};

const textStackClasses: Record<PageHeaderVariant, string> = {
  default: "gap-1",
  display: "gap-1.5",
};

export function PageHeader({ title, subtitle, actions, variant = "default" }: PageHeaderProps) {
  const hasSubtitle = subtitle !== undefined;
  const hasActions = actions !== undefined;

  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className={`flex flex-col ${textStackClasses[variant]}`}>
        {hasSubtitle && <span className="text-small text-fg-muted">{subtitle}</span>}
        <h1 className={`font-display font-semibold text-fg ${titleClasses[variant]}`}>{title}</h1>
      </div>
      {hasActions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
