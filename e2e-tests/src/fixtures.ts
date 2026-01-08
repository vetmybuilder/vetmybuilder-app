// e2e-tests/src/fixtures.ts
import { test as base, expect } from "@playwright/test";
import { getRuntime } from "./config/runtime";
import { ensureDatabase, applySchema, seedUsers } from "./db/manage-db";
import { wipeDatabase } from "./db/wipe";
import { api } from "./api/client";

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

    apiClient: async ({ request, runtime }, use) => {
      const secret = process.env.E2E_TEST_SECRET;
      const uid = process.env.TEST_USER_UID;

      if (!secret || !uid) {
        throw new Error("Missing E2E_TEST_SECRET or TEST_USER_UID");
      }

      const tokenRes = await request.post(
        `${runtime.apiBaseUrl}/api/__test__/auth/id-token`,
        {
          headers: { "X-Test-Secret": secret },
          data: { uid },
        }
      );

      if (!tokenRes.ok()) {
        throw new Error(`Failed to mint id token: ${tokenRes.status()}`);
      }

      const { idToken } = await tokenRes.json();

      await use(api(request, runtime.apiBaseUrl, idToken));
    },
  }
);

test.beforeEach(async ({ runtime }) => {
  await wipeDatabase(runtime.dbName);
});

export { expect };
