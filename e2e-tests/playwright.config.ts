import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: ".", // tests live alongside this config
  timeout: 60_000,
  retries: process.env.CI ? 2 : 1,
  workers: 1,
  reporter: process.env.CI ? [["list"], ["blob"], ["html"]] : "html",
  expect: { timeout: 15_000 },
  fullyParallel: true,
  use: {
    // Your dev Next runs on :3000 via `npm run dev`
    baseURL: process.env.E2E_BASE_URL || "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  // We don't start servers here—run your app separately with `npm run dev`
  projects: [
    {
      name: "chromium",
      // Use Playwright's bundled Chromium (no extensions) instead of system Chrome
      use: {
        ...devices["Desktop Chromium"],
        launchOptions: {
          args: [
            "--disable-extensions",
            "--disable-component-extensions-with-background-pages",
            "--disable-background-networking",
          ],
        },
      },
    },
  ],
});
