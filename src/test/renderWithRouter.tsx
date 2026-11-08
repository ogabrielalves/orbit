import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import { Providers } from "@/app/providers";
import { createTestQueryClient } from "@/test/createTestQueryClient";

const routePaths = [
  "/",
  "/projects",
  "/projects/$projectId",
  "/backlog",
  "/notes",
  "/graph",
  "/favorites",
  "/settings",
];

export function renderWithRouter(ui: ReactNode, initialPath = "/") {
  const rootRoute = createRootRoute({ component: () => ui });
  const childRoutes = routePaths.map((path) =>
    createRoute({ getParentRoute: () => rootRoute, path }),
  );
  const router = createRouter({
    routeTree: rootRoute.addChildren(childRoutes),
    history: createMemoryHistory({ initialEntries: [initialPath] }),
  });

  return render(
    <Providers queryClient={createTestQueryClient()}>
      <RouterProvider router={router} />
    </Providers>,
  );
}
