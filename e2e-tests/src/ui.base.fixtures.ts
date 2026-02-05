import { test as base, expect } from "@playwright/test";
import { LoginPage } from "../src/pages/LoginPage";
import { RegisterPage } from "../src/pages/RegisterPage";
import { SiteHeader } from "../src/pages/SiteHeader";
import { HomePage } from "../src/pages/HomePage";
import { getRuntime } from "../src/config/runtime";
import { wipeDatabase } from "../src/db/wipe";
import { HomeownerProjectsPage } from "../src/pages/HomeownerProjectsPage";
import { CreateProjectPage } from "../src/pages/CreateProjectPage";
import { ProjectDetailsPage } from "../src/pages/ProjectDetailsPage";
import { AuthHelper } from "../src/helpers/AuthHelper";

type Runtime = ReturnType<typeof getRuntime>;

type UiFixtures = {
  homePage: HomePage;
  loginPage: LoginPage;
  registerPage: RegisterPage;
  siteHeader: SiteHeader;
  homeownerProjectsPage: HomeownerProjectsPage;
  createProjectPage: CreateProjectPage;
  projectDetailsPage: ProjectDetailsPage;
  authHelper: AuthHelper;
};

function getUiShardIndex(testInfo: any): number {
  const name = String(testInfo?.project?.name || "");
  const m = name.match(/-s(\d+)$/);
  const n = m ? Number(m[1]) : 0;
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export const test = base.extend<UiFixtures, { runtime: Runtime }>({
  runtime: [
    async ({}, use, testInfo) => {
      const shardIndex = getUiShardIndex(testInfo);
      const runtime = getRuntime(0, shardIndex);
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

  createProjectPage: async ({ page }, use) => {
    await use(new CreateProjectPage(page));
  },

  projectDetailsPage: async ({ page }, use) => {
    await use(new ProjectDetailsPage(page));
  },

  siteHeader: async ({ page }, use) => {
    await use(new SiteHeader(page));
  },

  authHelper: async ({ request, page, runtime }, use) => {
    await use(new AuthHelper(request, page, runtime));
  },
});

test.beforeEach(async ({ runtime }) => {
  await wipeDatabase(runtime.dbName);
});

test.afterEach(async ({ context }) => {
  await context.close().catch(() => {});
});

export { expect };
