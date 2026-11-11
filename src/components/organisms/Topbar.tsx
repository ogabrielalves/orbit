import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

export type BreadcrumbLink =
  | { to: "/projects" }
  | { to: "/projects/$projectId"; params: { projectId: string } };

export type BreadcrumbItem = {
  label: string;
  link?: BreadcrumbLink;
};

type TopbarProps = {
  breadcrumb: (string | BreadcrumbItem)[];
  actions?: ReactNode;
};

type CrumbProps = {
  item: BreadcrumbItem;
  isCurrent: boolean;
};

function Crumb({ item, isCurrent }: CrumbProps) {
  const labelClass = isCurrent ? "font-semibold text-fg" : "text-fg-muted";
  const className = `truncate ${labelClass}`;
  const link = item.link;

  if (link === undefined || isCurrent) {
    return (
      <span aria-current={isCurrent ? "page" : undefined} className={className}>
        {item.label}
      </span>
    );
  }
  if (link.to === "/projects") {
    return (
      <Link to="/projects" className={`${className} hover:text-fg`}>
        {item.label}
      </Link>
    );
  }
  return (
    <Link to={link.to} params={link.params} className={`${className} hover:text-fg`}>
      {item.label}
    </Link>
  );
}

export function Topbar({ breadcrumb, actions }: TopbarProps) {
  const { t } = useTranslation();
  const hasActions = actions !== undefined;
  const items: BreadcrumbItem[] = breadcrumb.map((entry) =>
    typeof entry === "string" ? { label: entry } : entry,
  );
  const lastIndex = items.length - 1;

  return (
    <header className="flex min-h-(--topbar-height-compact) flex-wrap items-center gap-x-4 gap-y-3 border-b border-border bg-surface px-4 py-3 md:px-6 lg:min-h-(--topbar-height) lg:px-8">
      <nav aria-label={t("topbar.breadcrumbLabel")} className="min-w-0 flex-1">
        <ol className="flex items-center gap-2 text-body">
          {items.map((item, index) => {
            const isCurrent = index === lastIndex;
            const isFirst = index === 0;
            const key = items
              .slice(0, index + 1)
              .map((entry) => entry.label)
              .join("/");

            return (
              <li key={key} className="flex min-w-0 items-center gap-2">
                {!isFirst && (
                  <span aria-hidden="true" className="text-fg-subtle">
                    /
                  </span>
                )}
                <Crumb item={item} isCurrent={isCurrent} />
              </li>
            );
          })}
        </ol>
      </nav>
      {hasActions && <div className="flex items-center gap-2">{actions}</div>}
    </header>
  );
}
