// playwright.config.ts (API ONLY, parallel shards)
import { defineConfig } from "@playwright/test";
import dotenv from "dotenv";
import path from "path";
import { getRuntime } from "./src/config/runtime";

// Load env files
dotenv.config({ path: path.resolve(__dirname, ".env") });
dotenv.config({
  path: path.resolve(__dirname, ".env.e2e.local"),
  override: true,
});

const TOTAL_SHARDS = 4;
const API_BASE_PORT = 3100;

// Firebase emulator ports
const FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
const FIREBASE_EMULATOR_HUB_URL = "http://127.0.0.1:4400";

const runtimes = Array.from({ length: TOTAL_SHARDS }, (_, i) =>
  getRuntime(0, i),
);

const debugServerLogs = process.env.PW_SERVER_LOGS === "1";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  workers: TOTAL_SHARDS,
  timeout: 60_000,
  reporter: [["list"], ["html", { open: "never" }]],

  webServer: [
    // 1) Firebase auth emulator
    {
      command: debugServerLogs
        ? "node ../scripts/dev-manual-firebase.js"
        : "node ../scripts/dev-manual-firebase.js > /dev/null 2>&1",
      url: FIREBASE_EMULATOR_HUB_URL,
      reuseExistingServer: true,
      timeout: 120_000,
      env: {
        ...process.env,
        FIREBASE_AUTH_EMULATOR_HOST,
        NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST: FIREBASE_AUTH_EMULATOR_HOST,
      },
    },

    // 2) Sharded API servers
    ...runtimes.map((_, i) => {
      const port = String(API_BASE_PORT + i);
      const baseURL = `http://127.0.0.1:${port}`;

      const baseCommand = `PORT=${port} TEST_TOTAL_SHARDS=${TOTAL_SHARDS} TEST_SHARD=${i} node ../scripts/dev-manual-server.js`;

      return {
        command: debugServerLogs
          ? baseCommand
          : `${baseCommand} > /dev/null 2>&1`,
        url: `${baseURL}/health`,
        reuseExistingServer: false,
        timeout: 120_000,
        env: {
          ...process.env,

          PORT: port,
          TEST_ENV: "e2e",
          TEST_TOTAL_SHARDS: String(TOTAL_SHARDS),
          TEST_SHARD: String(i),

          FIREBASE_AUTH_EMULATOR_HOST,
          NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST: FIREBASE_AUTH_EMULATOR_HOST,

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
        baseURL: `http://127.0.0.1:${API_BASE_PORT + i}`,
      },
      shard: { total: TOTAL_SHARDS, current: i + 1 },
      workers: 1,
    })),
  ],
});
