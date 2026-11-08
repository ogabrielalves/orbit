import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

type TopbarProps = {
  breadcrumb: string[];
  actions?: ReactNode;
};

export function Topbar({ breadcrumb, actions }: TopbarProps) {
  const { t } = useTranslation();
  const hasActions = actions !== undefined;
  const lastIndex = breadcrumb.length - 1;

  return (
    <header className="flex min-h-(--topbar-height-compact) flex-wrap items-center gap-x-4 gap-y-3 border-b border-border bg-surface px-4 py-3 md:px-6 lg:min-h-(--topbar-height) lg:px-8">
      <nav aria-label={t("topbar.breadcrumbLabel")} className="min-w-0 flex-1">
        <ol className="flex items-center gap-2 text-body">
          {breadcrumb.map((label, index) => {
            const isCurrent = index === lastIndex;
            const isFirst = index === 0;
            const labelClass = isCurrent ? "font-semibold text-fg" : "text-fg-muted";

            return (
              <li key={label} className="flex min-w-0 items-center gap-2">
                {!isFirst && (
                  <span aria-hidden="true" className="text-fg-subtle">
                    /
                  </span>
                )}
                <span
                  aria-current={isCurrent ? "page" : undefined}
                  className={`truncate ${labelClass}`}
                >
                  {label}
                </span>
              </li>
            );
          })}
        </ol>
      </nav>
      {hasActions && <div className="flex items-center gap-2">{actions}</div>}
    </header>
  );
}
