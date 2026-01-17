import { test as base, expect } from "@playwright/test";
import { getRuntime } from "./config/runtime";
import { ensureDatabase, applySchema, seedUsers } from "./db/manage-db";
import { wipeDatabase } from "./db/wipe";
import { api, authedApiForUid } from "./api/services/client";

type Runtime = ReturnType<typeof getRuntime>;
type ApiClient = ReturnType<typeof api>;

function getShardIndex(testInfo: any): number {
  const name = String(testInfo?.project?.name || "");
  const match = name.match(/shard-(\d+)/i);

  if (match) {
    const n = Number(match[1]);
    if (Number.isFinite(n) && n >= 1) return n - 1; // shard-1 -> 0
  }

  const envShard = Number(process.env.TEST_SHARD);
  if (Number.isFinite(envShard) && envShard >= 0) return envShard;

  return 0;
}

function getProjectBaseURL(testInfo: any): string | undefined {
  const baseURL = testInfo?.project?.use?.baseURL;
  return typeof baseURL === "string" && baseURL ? baseURL : undefined;
}

export const test = base.extend<
  { apiClient: ApiClient; adminApiClient: ApiClient },
  { runtime: Runtime }
>({
  runtime: [
    async ({}, use, testInfo) => {
      const shardIndex = getShardIndex(testInfo);
      const runtime = getRuntime(testInfo.workerIndex, shardIndex);

      // Always prefer the Playwright project baseURL (per shard).
      const baseURL = getProjectBaseURL(testInfo);
      if (baseURL) {
        runtime.apiBaseUrl = baseURL;
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
    if (!uid) throw new Error("Missing TEST_USER_UID");

    const baseURL = getProjectBaseURL(testInfo) || runtime.apiBaseUrl;
    const client = await authedApiForUid(request, baseURL, uid, page);

    await use(client);
  },

  adminApiClient: async ({ request, runtime, page }, use, testInfo) => {
    const uid = process.env.TEST_ADMIN_USER_UID;
    if (!uid) throw new Error("Missing TEST_ADMIN_USER_UID");

    const baseURL = getProjectBaseURL(testInfo) || runtime.apiBaseUrl;
    const client = await authedApiForUid(request, baseURL, uid, page);

    await use(client);
  },
});

test.beforeEach(async ({ runtime }) => {
  await wipeDatabase(runtime.dbName);
});

export { expect };
