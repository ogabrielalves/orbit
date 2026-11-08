import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import { render } from "@testing-library/react";
import { Providers } from "@/app/providers";
import { createAppRouter } from "@/app/router";

export function renderApp(path: string) {
  const history = createMemoryHistory({ initialEntries: [path] });
  const router = createAppRouter(history);

  render(
    <Providers>
      <RouterProvider router={router} />
    </Providers>,
  );

  return router;
}
