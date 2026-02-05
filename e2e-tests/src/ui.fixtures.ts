import { type Page } from "@playwright/test";
import { test as uiBaseTest, expect } from "./ui.base.fixtures";
import { api, authedApiForUid } from "./api/services/client";
import { ProjectApi } from "./apiHelper/project/ProjectApi";
import { getRuntime } from "./config/runtime";
import { AuthHelper } from "./helpers/AuthHelper";
import { BasePage } from "./pages/BasePage";

type Runtime = ReturnType<typeof getRuntime>;
type ApiClient = ReturnType<typeof api>;

export const test = uiBaseTest.extend<{
  login: void;
  apiClient: ApiClient;
  adminApiClient: ApiClient;
  projectApi: ProjectApi;
  basePage: BasePage;
}>({
  // ✅ AUTO: log UI in properly (Firebase session) as TEST_USER_UID
  login: [
    async (
      { authHelper, page }: { authHelper: AuthHelper; page: Page },
      use,
    ) => {
      const uid = process.env.TEST_USER_UID;
      if (!uid) throw new Error("Missing TEST_USER_UID");

      await authHelper.loginAsUid(uid);

      // Force a clean UI boot after auth + DB wipe
      await page.goto("/");

      // Optional debug: keep if you still want it
      const apiBase =
        process.env.NEXT_PUBLIC_API_BASE || "http://localhost:3100";
      await page.request.get(`${apiBase}/health`);

      await use(undefined);
    },
    { auto: true },
  ],

  basePage: async ({ page }, use) => {
    await use(new BasePage(page));
  },

  apiClient: async (
    { page, runtime }: { page: Page; runtime: Runtime },
    use,
  ) => {
    const uid = process.env.TEST_USER_UID;
    if (!uid) throw new Error("Missing TEST_USER_UID");

    const client = await authedApiForUid(
      page.request,
      runtime.apiBaseUrl,
      uid,
      page,
    );
    await use(client);
  },

  adminApiClient: async (
    { page, runtime }: { page: Page; runtime: Runtime },
    use,
  ) => {
    const uid = process.env.TEST_ADMIN_USER_UID;
    if (!uid) throw new Error("Missing TEST_ADMIN_USER_UID");

    const client = await authedApiForUid(
      page.request,
      runtime.apiBaseUrl,
      uid,
      page,
    );
    await use(client);
  },

  projectApi: async ({ apiClient }: { apiClient: ApiClient }, use) => {
    await use(new ProjectApi(apiClient));
  },
});

export { expect };
