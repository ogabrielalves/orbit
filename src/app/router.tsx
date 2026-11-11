import {
  createRootRoute,
  createRoute,
  createRouter,
  type RouterHistory,
} from "@tanstack/react-router";
import type { ParseKeys } from "i18next";
import { RootLayout } from "@/app/RootLayout";
import { BacklogPage } from "@/pages/backlog/BacklogPage";
import { parseBacklogSearch } from "@/pages/backlog/backlogSearch";
import { BoardPage } from "@/pages/board/BoardPage";
import { parseBoardSearch } from "@/pages/board/boardSearch";
import { DashboardPage } from "@/pages/dashboard/DashboardPage";
import { FavoritesPage } from "@/pages/favorites/FavoritesPage";
import { GraphPage } from "@/pages/graph/GraphPage";
import { NotFoundPage } from "@/pages/not-found/NotFoundPage";
import { NotesPage } from "@/pages/notes/NotesPage";
import { parseNotesSearch } from "@/pages/notes/notesSearch";
import { ProjectDetailPage } from "@/pages/projects/ProjectDetailPage";
import { ProjectsPage } from "@/pages/projects/ProjectsPage";
import { parseProjectDetailSearch } from "@/pages/projects/projectDetailSearch";
import { parseProjectsSearch } from "@/pages/projects/projectsSearch";
import { SettingsPage } from "@/pages/settings/SettingsPage";
import { WelcomePage } from "@/pages/welcome/WelcomePage";

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
  component: ProjectsPage,
  validateSearch: parseProjectsSearch,
  staticData: { titleKey: "nav.projects" },
});

const projectDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/projects/$projectId",
  component: ProjectDetailPage,
  validateSearch: parseProjectDetailSearch,
  staticData: { titleKey: "nav.projects" },
});

const boardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/boards/$boardId",
  component: BoardPage,
  validateSearch: parseBoardSearch,
  staticData: { titleKey: "nav.boards" },
});

const backlogRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/backlog",
  component: BacklogPage,
  validateSearch: parseBacklogSearch,
  staticData: { titleKey: "nav.backlog" },
});

const notesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/notes",
  component: NotesPage,
  validateSearch: parseNotesSearch,
  staticData: { titleKey: "nav.notes" },
});

const noteDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/notes/$noteId",
  component: NotesPage,
  validateSearch: parseNotesSearch,
  staticData: { titleKey: "nav.notes" },
});

const graphRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/graph",
  component: GraphPage,
  staticData: { titleKey: "nav.graph" },
});

const favoritesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/favorites",
  component: FavoritesPage,
  staticData: { titleKey: "nav.favorites" },
});

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings",
  component: SettingsPage,
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
  return createRouter({ routeTree, history });
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
