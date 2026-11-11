import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import svgr from "vite-plugin-svgr";
import { configDefaults, defineConfig } from "vitest/config";

const tauriDevHost = process.env.TAURI_DEV_HOST;
const hasTauriDevHost = tauriDevHost !== undefined;

export default defineConfig({
  plugins: [react(), tailwindcss(), svgr({ include: "**/*.svg?react" })],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: tauriDevHost ?? false,
    hmr: hasTauriDevHost ? { protocol: "ws", host: tauriDevHost, port: 1421 } : undefined,
    watch: { ignored: ["**/src-tauri/**"] },
  },
  test: {
    environment: "jsdom",
    globals: false,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    exclude: [...configDefaults.exclude, "e2e/**", "dist-e2e/**"],
    passWithNoTests: true,
    testTimeout: 15_000,
    css: false,
  },
});
