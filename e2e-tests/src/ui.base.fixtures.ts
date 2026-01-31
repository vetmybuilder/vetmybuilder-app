import { test as base, expect } from "@playwright/test";
import { LoginPage } from "../src/pages/LoginPage";
import { RegisterPage } from "../src/pages/RegisterPage";
import { SiteHeader } from "../src/pages/SiteHeader";
import { HomePage } from "../src/pages/HomePage";
import { getRuntime } from "../src/config/runtime";
import { wipeDatabase } from "../src/db/wipe";
import { HomeownerProjectsPage } from "../src/pages/HomeownerProjectsPage";

type Runtime = ReturnType<typeof getRuntime>;

type UiFixtures = {
  homePage: HomePage;
  loginPage: LoginPage;
  registerPage: RegisterPage;
  siteHeader: SiteHeader;
  homeownerProjectsPage: HomeownerProjectsPage;
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

  homePage: async ({ page }, use) => {
    await use(new HomePage(page));
  },

  loginPage: async ({ page }, use) => {
    await use(new LoginPage(page));
  },

  registerPage: async ({ page }, use) => {
    await use(new RegisterPage(page));
  },

  homeownerProjectsPage: async ({ page }, use) => {
    await use(new HomeownerProjectsPage(page));
  },

  siteHeader: async ({ page }, use) => {
    await use(new SiteHeader(page));
  },
});

test.beforeEach(async ({ runtime }) => {
  // Keeps users/user_roles/roles, wipes everything else
  await wipeDatabase(runtime.dbName);
});

// Closing the context forces a clean session on every rerun.
test.afterEach(async ({ context }) => {
  await context.close().catch(() => {});
});

export { expect };
