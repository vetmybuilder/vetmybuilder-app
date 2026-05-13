import { test as uiBaseTest, expect } from "./ui.base.fixtures";
import { api, authedApiForUid } from "./api/services/client";
import { AccountApi } from "./apiHelper/account/AccountApi";
import { ProjectApi } from "./apiHelper/project/ProjectApi";
import { RecommendationApi } from "./apiHelper/project/ProjectRecommendationApi";
import { BasePage } from "./pages/BasePage";
import PipelineApi from "./apiHelper/pipeline/PipelineApi";
import SwipeMatchingApi from "./apiHelper/swipeMatching/SwipeMatchingApi";
import SwipeDeckPage from "./pages/SwipeDeckPage";
import MatchPage from "./pages/MatchPage";

type ApiClient = ReturnType<typeof api>;

const RUN_ID =
  process.env.PW_RUN_ID ||
  process.env.CI_RUN_ID ||
  `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const normalizeLocalhost = (url: string) =>
  url.replace("http://localhost", "http://127.0.0.1");

export const getWorkerUid = (workerIndex: number): string =>
  process.env[`TEST_USER_UID_${workerIndex}`] ||
  `${process.env.TEST_USER_UID || "e2e-user"}-w${workerIndex}-${RUN_ID}`;

const getWorkerAdminUid = (workerIndex: number): string =>
  process.env[`TEST_ADMIN_USER_UID_${workerIndex}`] ||
  `${process.env.TEST_ADMIN_USER_UID || "e2e-admin"}-w${workerIndex}-${RUN_ID}`;

export const test = uiBaseTest.extend<{
  login: void;
  apiClient: ApiClient;
  adminApiClient: ApiClient;
  projectApi: ProjectApi;
  accountApi: AccountApi;
  recommendationApi: RecommendationApi;
  pipelineApi: PipelineApi;
  swipeMatchingApi: SwipeMatchingApi;
  swipeDeckPage: SwipeDeckPage;
  matchPage: MatchPage;
  basePage: BasePage;
}>({
  login: [
    async ({ authHelper, page, runtime }, use, testInfo) => {
      const uid = getWorkerUid(testInfo.workerIndex);

      await authHelper.loginAsUid(uid);

      const apiBase =
        (process.env.DOCKER === "1"
          ? runtime.apiBaseUrl
          : normalizeLocalhost(runtime.apiBaseUrl)) ||
        (process.env.DOCKER === "1"
          ? process.env.API_BASE_URL
          : normalizeLocalhost(process.env.API_BASE_URL || "")) ||
        "http://127.0.0.1:3100";

      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          await page.request.get(`${apiBase}/health`);
          break;
        } catch (err: unknown) {
          const isConnReset =
            err instanceof Error && err.message.includes("ECONNRESET");
          if (!isConnReset || attempt === 2) throw err;
          await new Promise((r) => setTimeout(r, 300));
        }
      }

      await use(undefined);
    },
    { auto: true },
  ],

  basePage: async ({ page }, use) => {
    await use(new BasePage(page));
  },

  apiClient: async ({ login, page, runtime }, use, testInfo) => {
    // Depend on `login` (auto:true) so the browser is fully signed in
    // as the worker uid before any API token is minted. Without this
    // dep Playwright may resolve apiClient before login completes,
    // leaving the browser unauthenticated when the test body navigates.
    void login;
    const uid = getWorkerUid(testInfo.workerIndex);

    const client = await authedApiForUid(
      page.request,
      runtime.apiBaseUrl,
      uid,
      page,
    );

    await use(client);
  },

  adminApiClient: async ({ login, page, runtime }, use, testInfo) => {
    void login;
    const uid = getWorkerAdminUid(testInfo.workerIndex);

    const client = await authedApiForUid(
      page.request,
      runtime.apiBaseUrl,
      uid,
      page,
    );

    await use(client);
  },

  projectApi: async ({ apiClient }, use) => {
    await use(new ProjectApi(apiClient));
  },

  accountApi: async ({ apiClient }, use) => {
    await use(new AccountApi(apiClient));
  },

  recommendationApi: async ({ apiClient }, use) => {
    await use(new RecommendationApi(apiClient));
  },

  pipelineApi: async ({ adminApiClient, runtime }, use) => {
    await use(new PipelineApi(adminApiClient, runtime.dbName));
  },

  swipeMatchingApi: async ({ apiClient }, use) => {
    await use(new SwipeMatchingApi(apiClient));
  },

  swipeDeckPage: async ({ page }, use) => {
    await use(new SwipeDeckPage(page));
  },

  matchPage: async ({ page }, use) => {
    await use(new MatchPage(page));
  },
});

export { expect };
