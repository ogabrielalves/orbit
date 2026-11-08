import type { ReactNode } from "react";

type EmptyStateProps = {
  title: string;
  description?: string;
  actions?: ReactNode;
};

export function EmptyState({ title, description, actions }: EmptyStateProps) {
  const hasDescription = description !== undefined;
  const hasActions = actions !== undefined;

  return (
    <div className="flex flex-col items-center gap-2.5 rounded-xl border border-dashed border-border-strong px-5 py-6 text-center">
      <svg width="56" height="56" viewBox="0 0 56 56" fill="none" aria-hidden="true">
        <circle cx="28" cy="28" r="10" className="fill-primary-muted" />
        <ellipse
          cx="28"
          cy="28"
          rx="24"
          ry="9"
          strokeWidth="2"
          strokeDasharray="4 5"
          transform="rotate(-25 28 28)"
          className="stroke-primary-border"
        />
        <circle cx="49" cy="18" r="3.5" className="fill-accent" />
      </svg>
      <h3 className="text-heading-3 font-semibold text-fg">{title}</h3>
      {hasDescription && <p className="max-w-65 text-small text-fg-muted">{description}</p>}
      {hasActions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
