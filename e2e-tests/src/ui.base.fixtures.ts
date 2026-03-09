import { test as base, expect, APIResponse } from "@playwright/test";
import { LoginPage } from "../src/pages/LoginPage";
import { RegisterPage } from "../src/pages/RegisterPage";
import { SiteHeader } from "../src/pages/SiteHeader";
import { HomePage } from "../src/pages/HomePage";
import { getRuntime } from "../src/config/runtime";
import { wipeDatabase } from "../src/db/wipe";
import { HomeownerProjectsPage } from "../src/pages/HomeownerProjectsPage";
import { CreateProjectPage } from "../src/pages/CreateProjectPage";
import { EditProjectPage } from "../src/pages/EditProjectPage";
import { AccountPage } from "../src/pages/AccountPage";
import { ProjectDetailsPage } from "../src/pages/ProjectDetailsPage";
import { ProjectRecommendPage } from "../src/pages/ProjectRecommendPage";
import { AuthHelper } from "../src/helpers/AuthHelper";

type Runtime = ReturnType<typeof getRuntime>;

type UiFixtures = {
  homePage: HomePage;
  loginPage: LoginPage;
  accountPage: AccountPage;
  registerPage: RegisterPage;
  siteHeader: SiteHeader;
  homeownerProjectsPage: HomeownerProjectsPage;
  createProjectPage: CreateProjectPage;
  editProjectPage: EditProjectPage;
  projectDetailsPage: ProjectDetailsPage;
  projectRecommendPage: ProjectRecommendPage;
  authHelper: AuthHelper;
};

function normalizeApiBase(url: string): string {
  // Only normalize localhost -> 127.0.0.1 (fixes ::1 issues),
  // but DO NOT touch docker hostnames like http://server-w0:3100
  return url.replace(/^http:\/\/localhost\b/i, "http://127.0.0.1");
}

export const test = base.extend<UiFixtures, { runtime: Runtime }>({
  runtime: [
    async ({}, use, testInfo) => {
      // Runtime must be per-worker so each worker can target its own API + DB.
      const runtime = getRuntime(testInfo.workerIndex);
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

  accountPage: async ({ page }, use) => {
    await use(new AccountPage(page));
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

  editProjectPage: async ({ page }, use) => {
    await use(new EditProjectPage(page));
  },

  projectDetailsPage: async ({ page }, use) => {
    await use(new ProjectDetailsPage(page));
  },

  projectRecommendPage: async ({ page }, use) => {
    await use(new ProjectRecommendPage(page));
  },

  siteHeader: async ({ page }, use) => {
    await use(new SiteHeader(page));
  },

  authHelper: async ({ request, page, runtime }, use) => {
    await use(new AuthHelper(request, page, runtime));
  },
});

test.beforeEach(async ({ runtime, page }) => {
  const apiBase = normalizeApiBase(runtime.apiBaseUrl);

  let lastResponse: APIResponse | null = null;

  await expect
    .poll(
      async () => {
        try {
          const res = await page.request.get(`${apiBase}/health`);
          lastResponse = res;
          return res.ok();
        } catch {
          lastResponse = null;
          return false;
        }
      },
      {
        timeout: 30_000,
        intervals: [250, 250, 500, 1000],
        message: `Waiting for API health at ${apiBase}/health`,
      },
    )
    .toBe(true);

  const body = (await lastResponse!.json()) as {
    mysqlDatabase?: string | null;
  };

  // Prefer runtime.dbName (worker-specific). If server reports a db name, trust it only if present.
  const dbNameToWipe = body?.mysqlDatabase || runtime.dbName;

  await wipeDatabase(dbNameToWipe);
});

// Closing the context forces a clean session on every rerun.
test.afterEach(async ({ context }) => {
  await context.close().catch(() => {});
});

export { expect };
