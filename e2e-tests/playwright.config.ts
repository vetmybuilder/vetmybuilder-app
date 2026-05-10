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

// In Docker / CI the servers are started as separate containers.
// Skip webServer so Playwright doesn't try to launch them itself.
const SHOULD_MANAGE_SERVERS =
  process.env.DOCKER !== "1" && process.env.START_SERVERS !== "0";

// DB name that matches what buildDbName() in fixtures.ts derives for shard i.
// Passing this explicitly ensures server DB = test runtime DB.
function shardDbName(i: number): string {
  const prefix = process.env.TEST_DB_NAME_PREFIX || "vetmybuilder_test";
  return `${prefix}_s${i + 1}_${TOTAL_SHARDS}`;
}

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  workers: TOTAL_SHARDS,
  // Bumped from 60s to 90s — `authedApiForUid` (used by the apiClient fixture)
  // has its own internal 60s retry deadline for minting Firebase tokens. With
  // a 60s test timeout, a slow token mint could consume the entire budget
  // during fixture setup before the test body even ran.
  timeout: 90_000,
  // CI gets more retries to absorb shard pollution / DB wipe races. Local
  // gets a smaller bump so flakes still get caught but devs aren't left
  // waiting through repeated retries.
  retries: process.env.CI ? 3 : 1,
  reporter: [["list"], ["html", { open: "never" }]],

  ...(SHOULD_MANAGE_SERVERS
    ? {
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

                // Explicit DB name so server and test runtime use the same database.
                MYSQL_DATABASE: shardDbName(i),

                FIREBASE_AUTH_EMULATOR_HOST,
                NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST: FIREBASE_AUTH_EMULATOR_HOST,

                ...(debugServerLogs ? { DEBUG: "vmb:*" } : {}),
              },
            };
          }),
        ],
      }
    : {}),

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
        baseURL: SHOULD_MANAGE_SERVERS
          ? `http://127.0.0.1:${API_BASE_PORT + i}`
          : `http://server-w${i}:3100`,
      },
      shard: { total: TOTAL_SHARDS, current: i + 1 },
      workers: 1,
    })),
  ],
});
