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
import BuilderProfilePage from "./pages/BuilderProfilePage";
import MagicLinkPage from "./pages/MagicLinkPage";
import ShortlistPage from "./pages/ShortlistPage";
import AdminLeaderboardPage from "./pages/AdminLeaderboardPage";
import AdminLoginPage from "./pages/AdminLoginPage";
import AdminTradesmenPage from "./pages/AdminTradesmenPage";
import AdminRecommendationLeaderboardPage from "./pages/AdminRecommendationLeaderboardPage";
import TradesmanMyProfilePage from "./pages/TradesmanMyProfilePage";
import TradesmanEditPage from "./pages/TradesmanEditPage";
import TradesmanRegisterPage from "./pages/TradesmanRegisterPage";
import TradesmanApi from "./apiHelper/tradesman/TradesmanApi";
import AdminApi from "./apiHelper/admin/AdminApi";
import { ForgotPasswordPage } from "./pages/ForgotPasswordPage";
import { ResetPasswordPage } from "./pages/ResetPasswordPage";
import AdminUsersPage from "./pages/AdminUsersPage";

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
  builderProfilePage: BuilderProfilePage;
  magicLinkPage: MagicLinkPage;
  shortlistPage: ShortlistPage;
  projectDetailsPage: ProjectDetailsPage;
  projectRecommendPage: ProjectRecommendPage;
  authHelper: AuthHelper;
  adminLeaderboardPage: AdminLeaderboardPage;
  adminLoginPage: AdminLoginPage;
  adminTradesmenPage: AdminTradesmenPage;
  adminRecommendationLeaderboardPage: AdminRecommendationLeaderboardPage;
  tradesmanMyProfilePage: TradesmanMyProfilePage;
  tradesmanEditPage: TradesmanEditPage;
  tradesmanRegisterPage: TradesmanRegisterPage;
  tradesmanApi: TradesmanApi;
  adminApi: AdminApi;
  forgotPasswordPage: ForgotPasswordPage;
  resetPasswordPage: ResetPasswordPage;
  adminUsersPage: AdminUsersPage;
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

  // Override the built-in context fixture so every page in this worker uses
  // runtime.webBaseUrl as its baseURL. For worker 0 this is Next.js on :3000;
  // for workers 1+ it is the per-shard HTTP proxy on :3001/:3002/:3003 that
  // routes /api|uploads/* to the correct API shard, keeping all browser Axios
  // calls on the same origin and avoiding Authorization-header stripping.
  context: async ({ browser, contextOptions, runtime }, use) => {
    const ctx = await browser.newContext({
      ...contextOptions,
      baseURL: runtime.webBaseUrl,
    });
    await use(ctx);
    await ctx.close().catch(() => {});
  },

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

  builderProfilePage: async ({ page }, use) => {
    await use(new BuilderProfilePage(page));
  },

  magicLinkPage: async ({ page }, use) => {
    await use(new MagicLinkPage(page));
  },

  shortlistPage: async ({ page }, use) => {
    await use(new ShortlistPage(page));
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

  adminLeaderboardPage: async ({ page }, use) => {
    await use(new AdminLeaderboardPage(page));
  },

  adminLoginPage: async ({ page }, use) => {
    await use(new AdminLoginPage(page));
  },

  adminTradesmenPage: async ({ page }, use) => {
    await use(new AdminTradesmenPage(page));
  },

  adminRecommendationLeaderboardPage: async ({ page }, use) => {
    await use(new AdminRecommendationLeaderboardPage(page));
  },

  tradesmanMyProfilePage: async ({ page }, use) => {
    await use(new TradesmanMyProfilePage(page));
  },

  tradesmanEditPage: async ({ page }, use) => {
    await use(new TradesmanEditPage(page));
  },

  tradesmanRegisterPage: async ({ page }, use) => {
    await use(new TradesmanRegisterPage(page));
  },

  tradesmanApi: async ({ request, runtime }, use) => {
    await use(new TradesmanApi(request, runtime.apiBaseUrl));
  },

  forgotPasswordPage: async ({ page }, use) => {
    await use(new ForgotPasswordPage(page));
  },

  resetPasswordPage: async ({ page }, use) => {
    await use(new ResetPasswordPage(page));
  },

  adminUsersPage: async ({ page }, use) => {
    await use(new AdminUsersPage(page));
  },

  adminApi: async ({ request, runtime }, use) => {
    const adminUid = process.env.TEST_ADMIN_USER_UID!;
    const testSecret = process.env.E2E_TEST_SECRET!;
    const baseUrl = runtime.apiBaseUrl;
    // Use X-Sim-Uid + X-Test-Secret bypass to avoid Firebase token cache flakiness.
    // requireAdmin accepts this UID in test env without a DB role lookup.
    const client = {
      post: (path: string, payload?: any) =>
        request.post(baseUrl + path, {
          data: payload,
          headers: { "X-Sim-Uid": adminUid, "X-Test-Secret": testSecret },
        }),
    };
    await use(new AdminApi(client));
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

  // Update runtime so test-specific beforeEach hooks can use the correct DB name.
  runtime.dbName = dbNameToWipe;

  await wipeDatabase(dbNameToWipe);
});

// Closing the context forces a clean session on every rerun.
test.afterEach(async ({ context }) => {
  await context.close().catch(() => {});
});

export { expect };
