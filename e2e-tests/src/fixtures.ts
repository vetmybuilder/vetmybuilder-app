import {
  test as base,
  expect,
  type APIRequestContext,
  type Page,
} from "@playwright/test";
import { getRuntime } from "./config/runtime";
import { ensureDatabase, applySchema, seedUsers } from "./db/manage-db";
import { wipeDatabase } from "./db/wipe";
import { api, authedApiForUid } from "./api/services/client";
import { ProjectApi } from "./apiHelper/project/ProjectApi";

type Runtime = ReturnType<typeof getRuntime>;
type ApiClient = ReturnType<typeof api>;

function getShardIndex(testInfo: any): number {
  const name = String(testInfo?.project?.name || "");
  const match = name.match(/shard-(\d+)/i);

  if (match) {
    const n = Number(match[1]);
    if (Number.isFinite(n) && n >= 1) return n - 1;
  }

  const envShard = Number(process.env.TEST_SHARD);
  if (Number.isFinite(envShard) && envShard >= 0) return envShard;

  return 0;
}

function getProjectBaseURL(testInfo: any): string | undefined {
  const baseURL = testInfo?.project?.use?.baseURL;
  return typeof baseURL === "string" && baseURL ? baseURL : undefined;
}

function getApiBaseURL(testInfo: any, runtime: Runtime): string {
  const baseURL = getProjectBaseURL(testInfo);

  // Some UI projects run on :3000. API must use the shard baseURL (3100+).
  if (baseURL && !baseURL.includes(":3000")) return baseURL;

  return runtime.apiBaseUrl;
}

export const test = base.extend<
  {
    apiClient: ApiClient;
    adminApiClient: ApiClient;
    projectApi: ProjectApi;
  },
  { runtime: Runtime }
>({
  runtime: [
    async ({}, use, testInfo) => {
      const shardIndex = getShardIndex(testInfo);
      const runtime = getRuntime(testInfo.workerIndex, shardIndex);

      const baseURL = getProjectBaseURL(testInfo);

      // Only override runtime apiBaseUrl when the project baseURL isn't UI-only (:3000)
      if (baseURL && !baseURL.includes(":3000")) {
        runtime.apiBaseUrl = baseURL;
        runtime.webBaseUrl = baseURL;
      } else if (baseURL) {
        // Keep webBaseUrl on :3000, but apiBaseUrl remains the shard baseURL (3100+)
        runtime.webBaseUrl = baseURL;
      }

      await ensureDatabase(runtime.dbName);
      await applySchema(runtime.dbName);
      await seedUsers(runtime.dbName);

      await use(runtime);
    },
    { scope: "worker" },
  ],

  apiClient: async (
    { request, runtime, page }: { request: APIRequestContext; runtime: Runtime; page: Page },
    use,
    testInfo,
  ) => {
    const uid = process.env.TEST_USER_UID;
    if (!uid) throw new Error("Missing TEST_USER_UID");

    const baseURL = getApiBaseURL(testInfo, runtime);
    const client = await authedApiForUid(request, baseURL, uid, page);

    await use(client);
  },

  adminApiClient: async (
    { request, runtime, page }: { request: APIRequestContext; runtime: Runtime; page: Page },
    use,
    testInfo,
  ) => {
    const uid = process.env.TEST_ADMIN_USER_UID;
    if (!uid) throw new Error("Missing TEST_ADMIN_USER_UID");

    const baseURL = getApiBaseURL(testInfo, runtime);
    const client = await authedApiForUid(request, baseURL, uid, page);

    await use(client);
  },

  projectApi: async ({ apiClient }: { apiClient: ApiClient }, use) => {
    const projectApi = new ProjectApi(apiClient);
    await use(projectApi);
  },
});

test.beforeEach(async ({ runtime }) => {
  await wipeDatabase(runtime.dbName);
});

export { expect };