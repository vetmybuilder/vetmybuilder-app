import { test as base, expect } from "@playwright/test";
import { getRuntime } from "./config/runtime";
import { ensureDatabase, applySchema, seedUsers } from "./db/manage-db";
import { wipeDatabase } from "./db/wipe";
import { api, authedApiForUid } from "./api/client";

type Runtime = ReturnType<typeof getRuntime>;
type ApiClient = ReturnType<typeof api>;

// extend<TestFixtures, WorkerFixtures>
export const test = base.extend<{ apiClient: ApiClient }, { runtime: Runtime }>(
  {
    runtime: [
      async ({}, use, testInfo) => {
        const runtime = getRuntime(testInfo.workerIndex);

        await ensureDatabase(runtime.dbName);
        await applySchema(runtime.dbName);
        await seedUsers(runtime.dbName);

        await use(runtime);
      },
      { scope: "worker" },
    ],

    apiClient: async ({ request, runtime, page }, use) => {
      const uid = process.env.TEST_USER_UID;

      if (!uid) {
        throw new Error("Missing TEST_USER_UID");
      }

      const client = await authedApiForUid(
        request,
        runtime.apiBaseUrl,
        uid,
        page
      );
      await use(client);
    },
  }
);

test.beforeEach(async ({ runtime }) => {
  await wipeDatabase(runtime.dbName);
});

export { expect };
