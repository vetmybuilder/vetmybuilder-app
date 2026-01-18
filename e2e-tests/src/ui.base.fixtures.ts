import { test as base, expect } from "@playwright/test";
import { LoginPage } from "../src/pages/LoginPage";
import { SiteHeader } from "../src/pages/SiteHeader";
import { getRuntime } from "../src/config/runtime";
import { wipeDatabase } from "../src/db/wipe";

type Runtime = ReturnType<typeof getRuntime>;

type UiFixtures = {
  loginPage: LoginPage;
  siteHeader: SiteHeader;
};

export const test = base.extend<UiFixtures, { runtime: Runtime }>({
  runtime: [
    async ({}, use, testInfo) => {
      // UI always uses shard 0 (API server on :3100)
      const runtime = getRuntime(testInfo.workerIndex, 0);
      await use(runtime);
    },
    { scope: "worker" },
  ],

  loginPage: async ({ page }, use) => {
    await use(new LoginPage(page));
  },

  siteHeader: async ({ page }, use) => {
    await use(new SiteHeader(page));
  },
});

test.beforeEach(async ({ runtime }) => {
  // Keeps users/user_roles/roles, wipes everything else (projects, tradesmen, etc.)
  await wipeDatabase(runtime.dbName);
});

export { expect };
