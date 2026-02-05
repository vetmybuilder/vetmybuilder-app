import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, ".env") });

const WEB_PORT = 3000;
const DESKTOP_VIEWPORT = { width: 1440, height: 900 };

function isHeadless() {
  return process.env.PW_HEADLESS === "0";
}

function windowSizeArg(width: number, height: number) {
  return `--window-size=${width},${height}`;
}

export default defineConfig({
  testDir: "./tests",

  fullyParallel: true,
  workers: 1,

  timeout: 60_000,
  reporter: [["list"], ["html", { open: "never" }]],

  webServer: {
    command: "npm --prefix .. run dev:manual",
    url: `http://localhost:${WEB_PORT}`,
    reuseExistingServer: false,
    timeout: 120_000,
  },

  use: {
    headless: isHeadless(),
    storageState: undefined,
    contextOptions: { serviceWorkers: "block" },

    launchOptions: {
      slowMo: 150,
    },

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
        baseURL: `http://localhost:${WEB_PORT}`,
        viewport: null,
        launchOptions: {
          slowMo: 150,
          args: [
            windowSizeArg(DESKTOP_VIEWPORT.width, DESKTOP_VIEWPORT.height),
          ],
        },
      },
      workers: 1,
    },
    {
      name: "ui-desktop-firefox",
      testMatch: /tests\/ui\//,
      use: {
        browserName: "firefox",
        baseURL: `http://localhost:${WEB_PORT}`,
        viewport: DESKTOP_VIEWPORT,
      },
      workers: 1,
    },
    {
      name: "ui-desktop-webkit",
      testMatch: /tests\/ui\//,
      use: {
        browserName: "webkit",
        baseURL: `http://localhost:${WEB_PORT}`,
        viewport: DESKTOP_VIEWPORT,
      },
      workers: 1,
    },
    {
      name: "ui-mobile-chromium-android",
      testMatch: /tests\/ui\//,
      use: {
        ...devices["Pixel 7"],
        baseURL: `http://localhost:${WEB_PORT}`,
        launchOptions: {
          slowMo: 150,
          args: [
            windowSizeArg(
              devices["Pixel 7"].viewport.width,
              devices["Pixel 7"].viewport.height,
            ),
          ],
        },
      },
      workers: 1,
    },
    {
      name: "ui-mobile-chromium-iphone",
      testMatch: /tests\/ui\//,
      use: {
        ...devices["iPhone 14"],
        baseURL: `http://localhost:${WEB_PORT}`,
        launchOptions: {
          slowMo: 150,
          args: [
            windowSizeArg(
              devices["iPhone 14"].viewport.width,
              devices["iPhone 14"].viewport.height,
            ),
          ],
        },
      },
      workers: 1,
    },
    {
      name: "ui-mobile-webkit-iphone",
      testMatch: /tests\/ui\//,
      use: {
        ...devices["iPhone 14"],
        browserName: "webkit",
        baseURL: `http://localhost:${WEB_PORT}`,
      },
      workers: 1,
    },
  ],
});
