import {
  test as base,
  expect,
  type APIRequestContext,
  type Page,
  type TestInfo,
  type WorkerInfo,
} from "@playwright/test";
import { getRuntime } from "./config/runtime";
import { ensureDatabase, applySchema, seedUsers } from "./db/manage-db";
import { wipeDatabase } from "./db/wipe";
import { api, authedApiForUid } from "./api/services/client";
import ProjectApi from "./apiHelper/project/ProjectApi";
import ProjectRecommendationApi from "./apiHelper/project/ProjectRecommendationApi";
import HireApi from "./apiHelper/project/HireApi";
import AdminApi from "./apiHelper/admin/AdminApi";
import NotificationsApi from "./apiHelper/NotificationsApi";
import PipelineApi from "./apiHelper/pipeline/PipelineApi";
import TradesmanApi from "./apiHelper/tradesman/TradesmanApi";

type Runtime = ReturnType<typeof getRuntime>;
type ApiClient = ReturnType<typeof api>;

type TestFixtures = {
  apiClient: ApiClient;
  adminApiClient: ApiClient;
  projectApi: ProjectApi;
  projectRecommendationApi: ProjectRecommendationApi;
  hireApi: HireApi;
  adminApi: AdminApi;
  notificationsApi: NotificationsApi;
  pipelineApi: PipelineApi;
  tradesmanApi: TradesmanApi;
};

type WorkerFixtures = {
  runtime: Runtime;
};

type TestMeta = Pick<TestInfo, "project"> | Pick<WorkerInfo, "project">;

function getShardIndex(testInfo: TestMeta): number {
  const name = String(testInfo.project.name || "");
  const match = name.match(/shard-(\d+)/i);

  if (match) {
    const n = Number(match[1]);
    if (Number.isFinite(n) && n >= 1) return n - 1;
  }

  const envShardRaw =
    process.env.TEST_SHARD || process.env.PW_TEST_SHARD || process.env.SHARD;
  const envShard = Number(envShardRaw);

  if (Number.isFinite(envShard) && envShard >= 0) return envShard;

  return 0;
}

function getProjectBaseURL(testInfo: TestMeta): string | undefined {
  const baseURL = testInfo.project.use?.baseURL;
  return typeof baseURL === "string" && baseURL.length > 0
    ? baseURL
    : undefined;
}

function getApiBaseURL(testInfo: TestInfo, runtime: Runtime): string {
  const baseURL = getProjectBaseURL(testInfo);

  if (baseURL && !baseURL.includes(":3000")) {
    return baseURL;
  }

  return runtime.apiBaseUrl;
}

function buildDbName(shardIndex: number): string {
  const totalShards = Number(process.env.TEST_TOTAL_SHARDS || "4");
  const prefix = process.env.TEST_DB_NAME_PREFIX || "vetmybuilder_test";
  const shardLabel = `s${shardIndex + 1}_${totalShards}`;
  return `${prefix}_${shardLabel}`;
}

export const test = base.extend<TestFixtures, WorkerFixtures>({
  runtime: [
    async ({}, use, testInfo) => {
      const shardIndex = getShardIndex(testInfo);
      const runtime = getRuntime(testInfo.workerIndex, shardIndex);

      runtime.dbName = buildDbName(shardIndex);

      const baseURL = getProjectBaseURL(testInfo);

      if (baseURL && !baseURL.includes(":3000")) {
        runtime.apiBaseUrl = baseURL;
        runtime.webBaseUrl = baseURL;
      } else if (baseURL) {
        runtime.webBaseUrl = baseURL;
      }

      await ensureDatabase(runtime.dbName);
      await applySchema(runtime.dbName);
      await seedUsers(runtime.dbName);

      await use(runtime);
    },
    { scope: "worker" },
  ],

  apiClient: async ({ request, runtime, page }, use, testInfo) => {
    const uid = process.env.TEST_USER_UID;
    if (!uid) {
      throw new Error("Missing TEST_USER_UID");
    }

    const baseURL = getApiBaseURL(testInfo, runtime);
    const client = await authedApiForUid(
      request as APIRequestContext,
      baseURL,
      uid,
      page as Page,
    );

    await use(client);
  },

  adminApiClient: async ({ request, runtime, page }, use, testInfo) => {
    const uid = process.env.TEST_ADMIN_USER_UID;
    if (!uid) {
      throw new Error("Missing TEST_ADMIN_USER_UID");
    }

    const baseURL = getApiBaseURL(testInfo, runtime);
    const client = await authedApiForUid(
      request as APIRequestContext,
      baseURL,
      uid,
      page as Page,
    );

    await use(client);
  },

  projectApi: async ({ apiClient }, use) => {
    await use(new ProjectApi(apiClient));
  },

  projectRecommendationApi: async ({ apiClient }, use) => {
    await use(new ProjectRecommendationApi(apiClient));
  },

  hireApi: async ({ apiClient }, use) => {
    await use(new HireApi(apiClient));
  },

  adminApi: async ({ adminApiClient }, use) => {
    await use(new AdminApi(adminApiClient));
  },

  notificationsApi: async ({ apiClient }, use) => {
    await use(new NotificationsApi(apiClient));
  },

  pipelineApi: async ({ adminApiClient, runtime }, use) => {
    await use(new PipelineApi(adminApiClient, runtime.dbName));
  },

  tradesmanApi: async ({ request, runtime }, use) => {
    await use(new TradesmanApi(request, runtime.apiBaseUrl));
  },
});

test.beforeEach(async ({ runtime }) => {
  await wipeDatabase(runtime.dbName);
  await seedUsers(runtime.dbName);
});

export { expect };
