import { defineConfig } from "@playwright/test";
import dotenv from "dotenv";
import path from "path";
import { getRuntime } from "./src/config/runtime";

dotenv.config({ path: path.resolve(__dirname, ".env") });

const TOTAL_SHARDS = 4;
const BASE_PORT = 3100;

const runtimes = Array.from({ length: TOTAL_SHARDS }, (_, i) =>
  getRuntime(0, i)
);

function envStringsOnly(env: NodeJS.ProcessEnv): Record<string, string> {
  const result: Record<string, string> = {};

  Object.entries(env).forEach(([key, value]) => {
    if (typeof value === "string") {
      result[key] = value;
    }
  });

  return result;
}

const inheritEnv = envStringsOnly(process.env);
const debugServerLogs = process.env.PW_SERVER_LOGS === "1";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  timeout: 60_000,

  reporter: [["list"], ["html", { open: "never" }]],

  webServer: runtimes.map((rt, i) => {
    const port = String(BASE_PORT + i);
    const baseURL = `http://127.0.0.1:${port}`;

    const command = debugServerLogs
      ? "npm --prefix .. run dev:server"
      : "npm --prefix .. run dev:server >/dev/null 2>&1";

    return {
      command,
      url: `${baseURL}/health`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        ...inheritEnv,
        PORT: port,
        WEB_BASE_PORT: String(BASE_PORT),
        MYSQL_DATABASE: rt.dbName,
        TEST_ENV: "e2e",
        TEST_TOTAL_SHARDS: String(TOTAL_SHARDS),
        TEST_SHARD: String(i),
        ...(debugServerLogs ? { DEBUG: "vmb:*" } : {}),
      },
    };
  }),

  use: {
    trace: "retain-on-failure",
    video: "retain-on-failure",
    screenshot: "only-on-failure",
  },

  projects: runtimes.map((_, i) => ({
    name: `shard-${i + 1}`,
    use: { baseURL: `http://127.0.0.1:${BASE_PORT + i}` },
    shard: { total: TOTAL_SHARDS, current: i + 1 },
    workers: 1,
  })),
});
