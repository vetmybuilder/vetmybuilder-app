import { test as uiBaseTest, expect } from "./ui.base.fixtures";
import { api, authedApiForUid } from "./api/services/client";
import { AccountApi } from "./apiHelper/account/AccountApi";
import { ProjectApi } from "./apiHelper/project/ProjectApi";
import { BasePage } from "./pages/BasePage";

type ApiClient = ReturnType<typeof api>;

const RUN_ID =
  process.env.PW_RUN_ID ||
  process.env.CI_RUN_ID ||
  `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const normalizeLocalhost = (url: string) =>
  url.replace("http://localhost", "http://127.0.0.1");

const getWorkerUid = (workerIndex: number): string =>
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
  basePage: BasePage;
}>({
  login: [
    async ({ authHelper, page, runtime }, use, testInfo) => {
      const uid = getWorkerUid(testInfo.workerIndex);

      // Keep helper call simple (TS safe)
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

  apiClient: async ({ page, runtime }, use, testInfo) => {
    const uid = getWorkerUid(testInfo.workerIndex);

    const client = await authedApiForUid(
      page.request,
      runtime.apiBaseUrl,
      uid,
      page,
    );

    await use(client);
  },

  adminApiClient: async ({ page, runtime }, use, testInfo) => {
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
});

export { expect };
