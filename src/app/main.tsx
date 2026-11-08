import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Providers } from "@/app/providers";
import { router } from "@/app/router";
import "@/styles/global.css";

const rootElement = document.getElementById("root");

const isRootMissing = rootElement === null;

if (isRootMissing) {
  throw new Error("Root element not found");
}

createRoot(rootElement).render(
  <StrictMode>
    <Providers>
      <RouterProvider router={router} />
    </Providers>
  </StrictMode>,
);
