import { defineConfig } from "@playwright/test";
import dotenv from "dotenv";
import path from "path";
import { getRuntime } from "./src/config/runtime";

dotenv.config({ path: path.resolve(__dirname, ".env") });

const TOTAL_SHARDS = 4;

// API server base (your dev:server)
const API_BASE_PORT = 3100;

// Web app (Next) port (web/package.json uses 3000)
const WEB_PORT = 3000;

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
  timeout: 60_000,

  reporter: [["list"], ["html", { open: "never" }]],

  /**
   * ======================
   * Web servers
   * ======================
   * Always start:
   *  - Next.js web app on :3000 (serves "/")
   *  - API servers on :3100-:3103 (serve "/api/*" + "/health")
   */
  webServer: [
    // WEB (Next.js)
    {
      command: debugServerLogs
        ? "npm --prefix ../web run dev"
        : "npm --prefix ../web run dev >/dev/null 2>&1",
      url: `http://localhost:${WEB_PORT}`,
      reuseExistingServer: true,
      timeout: 120_000,
      env: {
        ...inheritEnv,
      },
    },

    // API (sharded servers)
    ...runtimes.map((rt, i) => {
      const port = String(API_BASE_PORT + i);
      const baseURL = `http://localhost:${port}`;

      return {
        command: debugServerLogs
          ? "npm --prefix .. run dev:server"
          : "npm --prefix .. run dev:server >/dev/null 2>&1",
        url: `${baseURL}/health`,
        reuseExistingServer: true,
        timeout: 120_000,
        env: {
          ...inheritEnv,
          PORT: port,
          WEB_BASE_PORT: String(API_BASE_PORT),
          MYSQL_DATABASE: rt.dbName,
          TEST_ENV: "e2e",
          TEST_TOTAL_SHARDS: String(TOTAL_SHARDS),
          TEST_SHARD: String(i),
          ...(debugServerLogs ? { DEBUG: "vmb:*" } : {}),
        },
      };
    }),
  ],

  /**
   * ======================
   * Shared browser config
   * ======================
   */
  use: {
    headless: true,
    viewport: null,
    launchOptions: {
      slowMo: 150,
      args: ["--start-maximized"],
    },

    trace: "retain-on-failure",
    video: "retain-on-failure",
    screenshot: "only-on-failure",
  },

  /**
   * ======================
   * Projects
   * ======================
   */
  projects: [
    // API / backend tests (sharded)
    ...runtimes.map((_, i) => ({
      name: `shard-${i + 1}`,
      testMatch: /tests\/(api|graphql)\//,
      use: {
        baseURL: `http://localhost:${API_BASE_PORT + i}`,
      },
      shard: { total: TOTAL_SHARDS, current: i + 1 },
      workers: 1,
    })),

    // UI tests (single project, always)
    {
      name: "ui",
      testMatch: /tests\/ui\//,
      use: {
        baseURL: `http://localhost:${WEB_PORT}`,
      },
      workers: 1,
    },
  ],
});
