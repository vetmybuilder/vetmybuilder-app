import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";
import path from "path";
import { getRuntime } from "./src/config/runtime";

dotenv.config({ path: path.resolve(__dirname, ".env") });

const TOTAL_SHARDS = 2;

const WEB_BASE_PORT = 3000;
const API_BASE_PORT = 3100;

const DESKTOP_VIEWPORT = { width: 1440, height: 900 };
const REPO_ROOT = path.resolve(__dirname, "..");
const HOST = "localhost";

function isHeadless(): boolean {
  // Always headless for now (per your request)
  return true;
}

function windowSizeArg(width: number, height: number) {
  return `--window-size=${width},${height}`;
}

// Match runtime/db naming exactly
const runtimes = Array.from({ length: TOTAL_SHARDS }, (_, i) =>
  getRuntime(0, i),
);

function envStringsOnly(env: NodeJS.ProcessEnv): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (typeof value === "string") result[key] = value;
  }
  return result;
}

const inheritEnv = envStringsOnly(process.env);
const debugServerLogs = process.env.PW_SERVER_LOGS === "1";

export default defineConfig({
  testDir: "./tests",

  fullyParallel: true,
  workers: TOTAL_SHARDS,

  timeout: 60_000,
  reporter: [["list"], ["html", { open: "never" }]],

  webServer: [
    // =====================
    // API shards (3100-3101)
    // =====================
    ...runtimes.map((rt, shard) => {
      const port = API_BASE_PORT + shard;

      return {
        cwd: REPO_ROOT,
        command:
          "node scripts/dev-manual-clean.js && node scripts/dev-manual-server.js",
        url: `http://${HOST}:${port}/health`,
        reuseExistingServer: false,
        timeout: 240_000,
        env: {
          ...inheritEnv,
          PORT: String(port),

          // make BOTH names available (server uses MYSQL_DATABASE, cleaner uses VMB_E2E_DB)
          MYSQL_DATABASE: rt.dbName,
          VMB_E2E_DB: rt.dbName,

          TEST_ENV: "e2e",
          TEST_TOTAL_SHARDS: String(TOTAL_SHARDS),
          TEST_SHARD: String(shard),

          ...(debugServerLogs ? { DEBUG: "vmb:*" } : {}),
        },
      };
    }),

    // =====================
    // UI shards (3000-3001)
    // =====================
    ...Array.from({ length: TOTAL_SHARDS }, (_, shard) => {
      const webPort = WEB_BASE_PORT + shard;
      const apiPort = API_BASE_PORT + shard;

      return {
        cwd: REPO_ROOT,
        command: "node scripts/dev-manual-web.js",
        url: `http://${HOST}:${webPort}`,
        reuseExistingServer: false,
        timeout: 300_000,
        env: {
          ...inheritEnv,
          PORT: String(webPort),
          NEXT_PUBLIC_API_BASE: `http://${HOST}:${apiPort}`,

          // silences the baseline-browser-mapping / Browserslist style warning during next dev
          BROWSERSLIST_IGNORE_OLD_DATA: "1",

          TEST_ENV: "e2e",
          TEST_TOTAL_SHARDS: String(TOTAL_SHARDS),
          TEST_SHARD: String(shard),
        },
      };
    }),
  ],

  use: {
    headless: isHeadless(),
    storageState: undefined,
    contextOptions: { serviceWorkers: "block" },
    // remove slowMo since we're headless and want speed
    launchOptions: { slowMo: 0 },
    trace: "retain-on-failure",
    video: "retain-on-failure",
    screenshot: "only-on-failure",
  },

  projects: [
    // 1 desktop + 1 mobile (per your request)
    {
      name: "ui-desktop-chromium-s0",
      testMatch: /tests\/ui\//,
      use: {
        browserName: "chromium",
        baseURL: `http://${HOST}:${WEB_BASE_PORT + 0}`,
        viewport: null,
        launchOptions: {
          args: [
            windowSizeArg(DESKTOP_VIEWPORT.width, DESKTOP_VIEWPORT.height),
          ],
        },
      },
      workers: 1,
    },
    {
      name: "ui-mobile-chromium-iphone-s1",
      testMatch: /tests\/ui\//,
      use: {
        ...devices["iPhone 14"],
        browserName: "chromium",
        baseURL: `http://${HOST}:${WEB_BASE_PORT + 1}`,
      },
      workers: 1,
    },
  ],
});
