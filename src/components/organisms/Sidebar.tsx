import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import AnnotationsIcon from "@/assets/icons/linha/anotacoes.svg?react";
import BacklogIcon from "@/assets/icons/linha/backlog.svg?react";
import SettingsIcon from "@/assets/icons/linha/configuracoes.svg?react";
import DashboardIcon from "@/assets/icons/linha/dashboard.svg?react";
import FavoritesIcon from "@/assets/icons/linha/favoritos.svg?react";
import GraphIcon from "@/assets/icons/linha/grafo.svg?react";
import ProjectsIcon from "@/assets/icons/linha/projetos.svg?react";
import CollapseIcon from "@/assets/icons/linha/recolher-menu.svg?react";
import logoUrl from "@/assets/logo/orbit-logo-animado.svg";
import { Tooltip } from "@/components/atoms/Tooltip";
import { NavItem } from "@/components/molecules/NavItem";

export type SidebarFavorite = {
  id: string;
  name: string;
  color: string;
};

type SidebarProps = {
  isCollapsed: boolean;
  canToggle: boolean;
  onToggle: () => void;
  favorites: SidebarFavorite[];
};

const mainNavItems = [
  { to: "/", icon: DashboardIcon, labelKey: "nav.dashboard" },
  { to: "/projects", icon: ProjectsIcon, labelKey: "nav.projects" },
  { to: "/backlog", icon: BacklogIcon, labelKey: "nav.backlog" },
  { to: "/notes", icon: AnnotationsIcon, labelKey: "nav.notes" },
  { to: "/graph", icon: GraphIcon, labelKey: "nav.graph" },
  { to: "/favorites", icon: FavoritesIcon, labelKey: "nav.favorites" },
] as const;

export function Sidebar({ isCollapsed, canToggle, onToggle, favorites }: SidebarProps) {
  const { t } = useTranslation();

  const isExpanded = !isCollapsed;
  const hasFavorites = favorites.length > 0;
  const widthClass = isCollapsed ? "w-(--sidebar-width-collapsed)" : "w-(--sidebar-width)";
  const headerAlignmentClass = isCollapsed ? "justify-center" : "justify-between";
  const toggleLabel = isCollapsed ? t("sidebar.expand") : t("sidebar.collapse");

  const collapseToggle = canToggle ? (
    <Tooltip label={toggleLabel} shortcut="Ctrl+\" side="right">
      <button
        type="button"
        aria-label={toggleLabel}
        onClick={onToggle}
        className="flex size-8 items-center justify-center rounded-sm text-fg-muted transition-colors hover:bg-surface-muted"
      >
        <CollapseIcon aria-hidden="true" className="size-4.5" />
      </button>
    </Tooltip>
  ) : null;

  return (
    <nav
      aria-label={t("nav.label")}
      className={`sticky top-0 flex h-screen shrink-0 flex-col gap-1.5 overflow-y-auto border-r border-border bg-surface px-3 py-4 ${widthClass}`}
    >
      <div className={`flex items-center gap-2 px-1 pb-3 ${headerAlignmentClass}`}>
        <Link to="/" aria-label={t("app.name")} className="flex items-center gap-2.5">
          <img src={logoUrl} alt="" className="size-7.5" />
          {isExpanded && (
            <span className="font-display text-heading-2 font-bold tracking-tight text-fg">
              {t("app.wordmark")}
            </span>
          )}
        </Link>
        {isExpanded && collapseToggle}
      </div>

      {mainNavItems.map((item) => (
        <NavItem
          key={item.to}
          to={item.to}
          icon={item.icon}
          label={t(item.labelKey)}
          isCollapsed={isCollapsed}
        />
      ))}

      {hasFavorites && (
        <>
          <div className="px-2.5 pt-4 pb-1.5">
            {isExpanded && (
              <span className="text-caption font-semibold tracking-wider text-fg-muted uppercase">
                {t("sidebar.favoritesTitle")}
              </span>
            )}
            {isCollapsed && <div className="h-px w-full bg-border" />}
          </div>
          {favorites.map((favorite) => (
            <Tooltip key={favorite.id} label={favorite.name} side="right" isDisabled={isExpanded}>
              <Link
                to="/projects/$projectId"
                params={{ projectId: favorite.id }}
                className="flex h-8.5 items-center gap-3 rounded-md px-2.5 text-body text-fg-secondary transition-colors hover:bg-surface-muted"
              >
                <span
                  aria-hidden="true"
                  style={{ backgroundColor: favorite.color }}
                  className="inline-flex size-4.5 shrink-0 items-center justify-center rounded-xs text-micro font-bold text-fg-on-primary"
                >
                  {favorite.name.charAt(0).toUpperCase()}
                </span>
                <span className={isCollapsed ? "sr-only" : "flex-1 truncate"}>{favorite.name}</span>
              </Link>
            </Tooltip>
          ))}
        </>
      )}

      <div className="mt-auto flex flex-col gap-1.5">
        {isCollapsed && collapseToggle}
        <NavItem
          to="/settings"
          icon={SettingsIcon}
          label={t("nav.settings")}
          isCollapsed={isCollapsed}
        />
      </div>
    </nav>
  );
}
