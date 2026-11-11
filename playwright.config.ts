import { defineConfig, devices } from "@playwright/test";

const port = 4173;
const isCi = process.env.CI !== undefined;

export default defineConfig({
  testDir: "e2e/tests",
  fullyParallel: true,
  forbidOnly: isCi,
  retries: isCi ? 1 : 0,
  workers: isCi ? 2 : undefined,
  reporter: isCi ? [["github"], ["html", { open: "never" }]] : "list",
  outputDir: "e2e/.results",
  use: {
    baseURL: `http://localhost:${port}`,
    locale: "en-US",
    timezoneId: "UTC",
    reducedMotion: "reduce",
    viewport: { width: 1280, height: 800 },
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } },
    },
  ],
  webServer: {
    command: `npx vite build --outDir dist-e2e --emptyOutDir && npx vite preview --outDir dist-e2e --port ${port} --strictPort`,
    url: `http://localhost:${port}`,
    reuseExistingServer: !isCi,
    timeout: 180_000,
  },
});
