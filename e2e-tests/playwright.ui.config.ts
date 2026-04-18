import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, ".env") });

const WEB_PORT = Number(process.env.WEB_PORT ?? 3000);

// Docker: never use localhost from inside the pw container.
// Local: keep localhost default.
const DEFAULT_BASE_URL =
  process.env.DOCKER === "1"
    ? `http://web:${WEB_PORT}`
    : `http://localhost:${WEB_PORT}`;

const BASE_URL = process.env.BASE_URL ?? DEFAULT_BASE_URL;

const DESKTOP_VIEWPORT = { width: 1440, height: 900 };

function isHeadless() {
  return process.env.PW_HEADLESS !== "0";
}

function windowSizeArg(width: number, height: number) {
  return `--window-size=${width},${height}`;
}

function envStringsOnly(env: NodeJS.ProcessEnv): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [k, v] of Object.entries(env)) {
    if (typeof v === "string") result[k] = v;
  }
  return result;
}

/**
 * Local dev: we still want Playwright to boot the app (current behaviour).
 * Docker: we will run the app as a separate container, so Playwright must NOT run webServer.
 */
const SHOULD_START_WEB_SERVER = process.env.START_WEB_SERVER
  ? process.env.START_WEB_SERVER === "1"
  : !process.env.CI && !process.env.DOCKER; // default: local true, CI/docker false

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  // Parallel shard isolation: worker N's browser hits a transparent HTTP proxy
  // on port 3000+N (scripts/dev-manual-proxy.js). The proxy routes /api|uploads
  // to shard N's API server (port 3100+N) and everything else to Next.js (:3000).
  // Browser Axios uses relative /api paths, so requests always go to the same
  // origin (the proxy), keeping the Authorization header intact.
  workers: process.env.PW_WORKERS ? Number(process.env.PW_WORKERS) : 2,
  timeout: Number(process.env.PW_TIMEOUT ?? 60_000),
  retries: 1,
  reporter: [["list"], ["html", { open: "never" }]],

  ...(SHOULD_START_WEB_SERVER
    ? {
        webServer: {
          command: "npm --prefix .. run dev:manual",
          url: DEFAULT_BASE_URL,
          reuseExistingServer: process.env.CI ? false : true,
          timeout: 120_000,
          env: {
            ...envStringsOnly(process.env),
          },
        },
      }
    : {}),

  use: {
    headless: isHeadless(),
    storageState: undefined,
    contextOptions: { serviceWorkers: "block" },
    launchOptions: { slowMo: 0 },
    trace: "retain-on-failure",
    video: "retain-on-failure",
    screenshot: "only-on-failure",
  },

  projects: [
    {
      name: "ui-desktop-chromium",
      testMatch: /tests\/ui\//,
      use: {
        browserName: "chromium",
        baseURL: BASE_URL,
        viewport: null,
        launchOptions: {
          args: [
            windowSizeArg(DESKTOP_VIEWPORT.width, DESKTOP_VIEWPORT.height),
          ],
        },
      },
    },
    {
      name: "ui-mobile-webkit-iphone",
      testMatch: /tests\/ui\//,
      testIgnore: /tests\/ui\/admin\//,
      timeout: 90_000,
      use: {
        ...devices["iPhone 14"],
        browserName: "webkit",
        baseURL: BASE_URL,
      },
    },
  ],
});
