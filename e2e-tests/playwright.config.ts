// e2e-tests/playwright.config.ts
import { defineConfig } from "@playwright/test";
import dotenv from "dotenv";
import path from "path";
import { getRuntime } from "./src/config/runtime";

dotenv.config({ path: path.resolve(__dirname, ".env") });

const rt = getRuntime();

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  timeout: 60_000,

  reporter: [["list"], ["html", { open: "never" }]],

  use: {
    baseURL: rt.webBaseUrl,
    trace: "on",
    video: "on",
    screenshot: "on",
  },
});
