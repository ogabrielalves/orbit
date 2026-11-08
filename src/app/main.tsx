import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@/styles/global.css";

const rootElement = document.getElementById("root");
const isRootMissing = rootElement === null;

if (isRootMissing) {
  throw new Error("Root element not found");
}

createRoot(rootElement).render(
  <StrictMode>
    <div className="min-h-full bg-canvas font-sans text-fg" />
  </StrictMode>,
);
