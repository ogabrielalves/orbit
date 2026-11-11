import { Outlet, useLocation, useMatches } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { WindowCloseGuard } from "@/app/WindowCloseGuard";
import { SearchTrigger } from "@/components/molecules/SearchTrigger";
import { Sidebar } from "@/components/organisms/Sidebar";
import { Topbar } from "@/components/organisms/Topbar";
import { AppShell } from "@/components/templates/AppShell";
import { useHotkey } from "@/hooks/useHotkey";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useUiStore } from "@/hooks/useUiStore";
import { mediaQueries } from "@/lib/breakpoints";
import { useFavorites } from "@/modules/favorites/queries";
import { useVaultEvents } from "@/modules/notes/useVaultEvents";
import { useOnboardingGuard, WELCOME_PATH } from "@/modules/settings/useOnboardingGuard";
import { useSyncLanguage } from "@/modules/settings/useSyncLanguage";
import { CommandPalette } from "@/pages/search/CommandPalette";

export function RootLayout() {
  const { t } = useTranslation();
  useSyncLanguage();
  useVaultEvents();
  const matches = useMatches();
  const isTablet = useMediaQuery(mediaQueries.tablet);
  const isDesktop = useMediaQuery(mediaQueries.desktop);
  const isCollapsedByUser = useUiStore((state) => state.isSidebarCollapsed);
  const toggleSidebar = useUiStore((state) => state.toggleSidebar);
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);

  function handleToggleSidebar() {
    if (isDesktop) {
      toggleSidebar();
    }
  }

  useHotkey("mod+\\", handleToggleSidebar);
  useHotkey("mod+k", () => setIsPaletteOpen((isOpen) => !isOpen));

  const favoritesQuery = useFavorites();
  const gate = useOnboardingGuard();
  const pathname = useLocation({ select: (location) => location.pathname });
  const isWelcome = pathname === WELCOME_PATH;
  const isGateReady = gate === "ready";

  if (!isGateReady) {
    return <div aria-hidden="true" className="min-h-screen bg-canvas" />;
  }

  if (isWelcome) {
    return <Outlet />;
  }

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
      favorites={favoritesQuery.data ?? []}
    />
  ) : null;

  return (
    <AppShell
      sidebar={sidebar}
      topbar={
        <Topbar
          breadcrumb={breadcrumb}
          actions={
            <SearchTrigger
              label={t("topbar.searchPlaceholder")}
              shortcut="Ctrl K"
              onClick={() => setIsPaletteOpen(true)}
            />
          }
        />
      }
    >
      <Outlet />
      <WindowCloseGuard />
      <CommandPalette isOpen={isPaletteOpen} onClose={() => setIsPaletteOpen(false)} />
    </AppShell>
  );
}
