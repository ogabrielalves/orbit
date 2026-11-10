import { Outlet, useMatches } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Sidebar } from "@/components/organisms/Sidebar";
import { Topbar } from "@/components/organisms/Topbar";
import { AppShell } from "@/components/templates/AppShell";
import { useHotkey } from "@/hooks/useHotkey";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useUiStore } from "@/hooks/useUiStore";
import { mediaQueries } from "@/lib/breakpoints";
import { useVaultEvents } from "@/modules/notes/useVaultEvents";
import { useSyncLanguage } from "@/modules/settings/useSyncLanguage";

export function RootLayout() {
  const { t } = useTranslation();
  useSyncLanguage();
  useVaultEvents();
  const matches = useMatches();
  const isTablet = useMediaQuery(mediaQueries.tablet);
  const isDesktop = useMediaQuery(mediaQueries.desktop);
  const isCollapsedByUser = useUiStore((state) => state.isSidebarCollapsed);
  const toggleSidebar = useUiStore((state) => state.toggleSidebar);

  function handleToggleSidebar() {
    if (isDesktop) {
      toggleSidebar();
    }
  }

  useHotkey("mod+\\", handleToggleSidebar);

  const isSidebarCollapsed = !isDesktop || isCollapsedByUser;

  const breadcrumb = matches.flatMap((match) => {
    const titleKey = match.staticData.titleKey;
    const hasTitle = titleKey !== undefined;
    return hasTitle ? [t(titleKey)] : [];
  });

  const sidebar = isTablet ? (
    <Sidebar
      isCollapsed={isSidebarCollapsed}
      canToggle={isDesktop}
      onToggle={handleToggleSidebar}
      favorites={[]}
    />
  ) : null;

  return (
    <AppShell sidebar={sidebar} topbar={<Topbar breadcrumb={breadcrumb} />}>
      <Outlet />
    </AppShell>
  );
}
