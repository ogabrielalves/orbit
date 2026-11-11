import { Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useBreadcrumb } from "@/app/useBreadcrumb";
import { WindowCloseGuard } from "@/app/WindowCloseGuard";
import { SearchTrigger } from "@/components/molecules/SearchTrigger";
import { Sidebar } from "@/components/organisms/Sidebar";
import { Topbar } from "@/components/organisms/Topbar";
import { AppShell } from "@/components/templates/AppShell";
import { useHotkey } from "@/hooks/useHotkey";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useUiStore } from "@/hooks/useUiStore";
import { mediaQueries } from "@/lib/breakpoints";
import { creationShortcuts, isDialogOpen } from "@/lib/shortcuts";
import { useFavorites } from "@/modules/favorites/queries";
import { useVaultEvents } from "@/modules/notes/useVaultEvents";
import { useOnboardingGuard, WELCOME_PATH } from "@/modules/settings/useOnboardingGuard";
import { useSyncLanguage } from "@/modules/settings/useSyncLanguage";
import { CommandPalette, type ProjectAction } from "@/pages/search/CommandPalette";

export function RootLayout() {
  const { t } = useTranslation();
  useSyncLanguage();
  useVaultEvents();
  const navigate = useNavigate();
  const breadcrumb = useBreadcrumb();
  const isTablet = useMediaQuery(mediaQueries.tablet);
  const isDesktop = useMediaQuery(mediaQueries.desktop);
  const isCollapsedByUser = useUiStore((state) => state.isSidebarCollapsed);
  const toggleSidebar = useUiStore((state) => state.toggleSidebar);
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const [paletteAction, setPaletteAction] = useState<ProjectAction | undefined>(undefined);
  const gate = useOnboardingGuard();
  const pathname = useLocation({ select: (location) => location.pathname });
  const isWelcome = pathname === WELCOME_PATH;
  const isGateReady = gate === "ready";
  const isShellActive = isGateReady && !isWelcome;

  function handleToggleSidebar() {
    if (isDesktop) {
      toggleSidebar();
    }
  }

  useHotkey("mod+\\", handleToggleSidebar);
  useHotkey("mod+k", () => setIsPaletteOpen((isOpen) => !isOpen));

  function openPalette(action: ProjectAction | undefined) {
    setPaletteAction(action);
    setIsPaletteOpen(true);
  }

  function closePalette() {
    setIsPaletteOpen(false);
    setPaletteAction(undefined);
  }

  function runCreation(action: () => void) {
    const canRun = isShellActive && !isDialogOpen();
    if (canRun) {
      action();
    }
  }

  useHotkey(creationShortcuts.newProject, () =>
    runCreation(() => void navigate({ to: "/projects", search: { new: 1 } })),
  );
  useHotkey(creationShortcuts.newNote, () =>
    runCreation(() => void navigate({ to: "/notes", search: { new: 1 } })),
  );
  useHotkey(creationShortcuts.newTask, () => runCreation(() => openPalette("task")));
  useHotkey(creationShortcuts.newBoard, () => runCreation(() => openPalette("board")));

  const favoritesQuery = useFavorites();
  if (!isGateReady) {
    return <div aria-hidden="true" className="min-h-screen bg-canvas" />;
  }

  if (isWelcome) {
    return <Outlet />;
  }

  const isSidebarCollapsed = !isDesktop || isCollapsedByUser;

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
              onClick={() => openPalette(undefined)}
            />
          }
        />
      }
    >
      <Outlet />
      <WindowCloseGuard />
      <CommandPalette isOpen={isPaletteOpen} onClose={closePalette} initialAction={paletteAction} />
    </AppShell>
  );
}
