// playwright.config.ts (API ONLY, parallel shards)
import { defineConfig } from "@playwright/test";
import dotenv from "dotenv";
import path from "path";
import { getRuntime } from "./src/config/runtime";

dotenv.config({ path: path.resolve(__dirname, ".env") });

const TOTAL_SHARDS = 4;
const API_BASE_PORT = 3100;

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

  // allow parallel execution across shard projects
  fullyParallel: true,

  // run 4 shard projects concurrently
  workers: TOTAL_SHARDS,

  timeout: 60_000,

  reporter: [["list"], ["html", { open: "never" }]],

  /**
   * ======================
   * Web servers (API ONLY)
   * ======================
   * Starts sharded API servers on :3100-:3103 (serve "/api/*" + "/health")
   */
  webServer: [
    ...runtimes.map((rt, i) => {
      const port = String(API_BASE_PORT + i);
      const baseURL = `http://localhost:${port}`;

      return {
        command: debugServerLogs
          ? "npm --prefix .. run dev:server"
          : "npm --prefix .. run dev:server >/dev/null 2>&1",
        url: `${baseURL}/health`,
        reuseExistingServer: false,
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

  use: {
    headless: true,
    trace: "retain-on-failure",
    video: "retain-on-failure",
    screenshot: "only-on-failure",
  },

  projects: [
    ...runtimes.map((_, i) => ({
      name: `shard-${i + 1}`,
      testMatch: /tests\/(api|graphql)\//,
      use: {
        baseURL: `http://localhost:${API_BASE_PORT + i}`,
      },
      shard: { total: TOTAL_SHARDS, current: i + 1 },

      // one worker per shard (prevents same shard DB/server being hit by >1 worker)
      workers: 1,
    })),
  ],
});
