import {
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
  type RouterHistory,
} from "@tanstack/react-router";
import type { ParseKeys } from "i18next";
import { RootLayout } from "@/app/RootLayout";
import { RoutePending } from "@/components/molecules/RoutePending";
import { parseBacklogSearch } from "@/pages/backlog/backlogSearch";
import { parseBoardSearch } from "@/pages/board/boardSearch";
import { DashboardPage } from "@/pages/dashboard/DashboardPage";
import { NotFoundPage } from "@/pages/not-found/NotFoundPage";
import { parseNotesSearch } from "@/pages/notes/notesSearch";
import { parseProjectDetailSearch } from "@/pages/projects/projectDetailSearch";
import { parseProjectsSearch } from "@/pages/projects/projectsSearch";
import { WelcomePage } from "@/pages/welcome/WelcomePage";

const lazyBacklogPage = lazyRouteComponent(
  () => import("@/pages/backlog/BacklogPage"),
  "BacklogPage",
);
const lazyBoardPage = lazyRouteComponent(() => import("@/pages/board/BoardPage"), "BoardPage");
const lazyFavoritesPage = lazyRouteComponent(
  () => import("@/pages/favorites/FavoritesPage"),
  "FavoritesPage",
);
const lazyGraphPage = lazyRouteComponent(() => import("@/pages/graph/GraphPage"), "GraphPage");
const lazyNotesPage = lazyRouteComponent(() => import("@/pages/notes/NotesPage"), "NotesPage");
const lazyProjectDetailPage = lazyRouteComponent(
  () => import("@/pages/projects/ProjectDetailPage"),
  "ProjectDetailPage",
);
const lazyProjectsPage = lazyRouteComponent(
  () => import("@/pages/projects/ProjectsPage"),
  "ProjectsPage",
);
const lazySettingsPage = lazyRouteComponent(
  () => import("@/pages/settings/SettingsPage"),
  "SettingsPage",
);

const rootRoute = createRootRoute({
  component: RootLayout,
  notFoundComponent: NotFoundPage,
});

const dashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: DashboardPage,
  staticData: { titleKey: "nav.dashboard" },
});

const projectsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/projects",
  component: lazyProjectsPage,
  validateSearch: parseProjectsSearch,
  staticData: { titleKey: "nav.projects" },
});

const projectDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/projects/$projectId",
  component: lazyProjectDetailPage,
  validateSearch: parseProjectDetailSearch,
  staticData: { titleKey: "nav.projects" },
});

const boardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/boards/$boardId",
  component: lazyBoardPage,
  validateSearch: parseBoardSearch,
  staticData: { titleKey: "nav.boards" },
});

const backlogRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/backlog",
  component: lazyBacklogPage,
  validateSearch: parseBacklogSearch,
  staticData: { titleKey: "nav.backlog" },
});

const notesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/notes",
  component: lazyNotesPage,
  validateSearch: parseNotesSearch,
  staticData: { titleKey: "nav.notes" },
});

const noteDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/notes/$noteId",
  component: lazyNotesPage,
  validateSearch: parseNotesSearch,
  staticData: { titleKey: "nav.notes" },
});

const graphRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/graph",
  component: lazyGraphPage,
  staticData: { titleKey: "nav.graph" },
});

const favoritesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/favorites",
  component: lazyFavoritesPage,
  staticData: { titleKey: "nav.favorites" },
});

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings",
  component: lazySettingsPage,
  staticData: { titleKey: "nav.settings" },
});

const welcomeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/welcome",
  component: WelcomePage,
});

const routeTree = rootRoute.addChildren([
  welcomeRoute,
  dashboardRoute,
  projectsRoute,
  projectDetailRoute,
  boardRoute,
  backlogRoute,
  notesRoute,
  noteDetailRoute,
  graphRoute,
  favoritesRoute,
  settingsRoute,
]);

export function createAppRouter(history?: RouterHistory) {
  return createRouter({
    routeTree,
    history,
    defaultPendingComponent: RoutePending,
    defaultPendingMs: 120,
    defaultPreload: "intent",
  });
}

export const router = createAppRouter();

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }

  interface StaticDataRouteOption {
    titleKey?: ParseKeys;
  }
}
