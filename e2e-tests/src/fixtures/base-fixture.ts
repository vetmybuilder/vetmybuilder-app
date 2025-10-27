import {
  test as base,
  expect as pwExpect,
  request as pwRequest,
  type APIRequestContext,
} from "@playwright/test";

import { CreateProjectPage } from "../pages/CreateProjectPage";
import { BasePage } from "../pages/BasePage";
import { ProjectsPage } from "../pages/ProjectsPage";
import { ProjectRecommendPage } from "../pages/ProjectRecommendPage";
import { RecommendationsPage } from "../pages/RecommendationsPage";
import { AccountPage } from "../pages/AccountPage";
import { HomePage } from "../pages/HomePage";
import { RegisterPage } from "../pages/RegisterPage";
import { LoginPage } from "../pages/LoginPage";
import { ProjectViewPage } from "../pages/ProjectViewPage";

import { UsersApi } from "../api-utils/users-api";
import { TestApi } from "../api-utils/test-api";
import { ProjectsApi } from "../api-utils/projects-api";
import { RecommendationsApi } from "../api-utils/recommendations-api";

import {
  createProjectsApiForPage,
  createRecommendationsApiForPage,
} from "../api-utils/api-factory";

/* ===== Env (with sensible defaults for local dev) ===== */
const API_BASE = process.env.E2E_API_BASE || "http://localhost:8787";
const API_PREFIX = process.env.E2E_API_PREFIX || "/api";
const TEST_SECRET = process.env.E2E_TEST_SECRET || "";
const TEST_UID = process.env.E2E_TEST_UID || "BpSvMxVVpnQeG211hiY8cNPbDCW2"; // fallback UID

/* ===== Small util to derive location tokens used by community filters ===== */
function deriveLocationFields(raw?: string) {
  const loc = String(raw || "")
    .trim()
    .toUpperCase(); // e.g. "E4", "E4 9AA"
  if (!loc) {
    return {
      location: "",
      postcode: null as string | null,
      postcodeSector: null as string | null,
      postcodeOutward: null as string | null,
      city: null as string | null,
    };
  }
  const outward = loc.split(/\s+/)[0];
  return {
    location: loc,
    postcode: loc,
    postcodeSector: outward,
    postcodeOutward: outward,
    city: null as string | null,
  };
}

/* ===== Flake hardening helpers (kept tiny) ===== */
function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
const TRANSIENT_STATUS = new Set([502, 503, 504]);
const TRANSIENT_ERR_CODES = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "EAI_AGAIN",
]);

async function postWithRetry(
  request: APIRequestContext,
  url: string,
  {
    maxRetries = 5,
    baseDelay = 200,
    timeout = 15000,
    headers = {},
    data,
  }: {
    maxRetries?: number;
    baseDelay?: number;
    timeout?: number;
    headers?: Record<string, string>;
    data?: any;
  } = {}
) {
  let attempt = 0;
  while (true) {
    try {
      const res = await request.post(url, {
        data,
        timeout,
        headers: {
          "X-Test-Secret": TEST_SECRET,
          Connection: "close",
          ...headers,
        },
      });
      if (res.ok()) return res;
      if (!TRANSIENT_STATUS.has(res.status())) {
        const text = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status()} ${text}`);
      }
    } catch (e: any) {
      const transientNetwork = e?.code && TRANSIENT_ERR_CODES.has(e.code);
      if (!transientNetwork && attempt >= maxRetries) throw e;
    }
    if (attempt++ >= maxRetries) {
      throw new Error(`POST ${url} failed after ${maxRetries + 1} attempts`);
    }
    const delay = baseDelay * Math.pow(2, attempt - 1);
    await sleep(delay + Math.floor(Math.random() * 100));
  }
}

const runSerialized = (() => {
  let tail = Promise.resolve();
  return async <T>(fn: () => Promise<T>): Promise<T> => {
    let release!: () => void;
    const next = new Promise<void>((r) => (release = r));
    const prev = tail;
    tail = tail.then(() => next);
    await prev;
    try {
      return await fn();
    } finally {
      release();
    }
  };
})();

/* ===== Fixtures ===== */
type TestFixtures = {
  cleanUpTestData: void; // Auto: clears DB BEFORE each test
  login: void; // Auto: logs in a seeded user in the browser
  ownerUid: string; // Auto: UID of the logged-in user
  loginAsOwner: (opts?: { redirect?: string }) => Promise<void>; // Auto: helper for the owner

  // Pages
  homePage: HomePage;
  registerPage: RegisterPage;
  loginPage: LoginPage;
  createProjectPage: CreateProjectPage;
  projectViewPage: ProjectViewPage;
  basePage: BasePage;
  projectsPage: ProjectsPage;
  projectRecommendPage: ProjectRecommendPage;
  recommendationsPage: RecommendationsPage;
  accountPage: AccountPage;

  // APIs
  usersApi: UsersApi;
  testApi: TestApi;
  projectsApi: ProjectsApi;
  recommendationsApi: RecommendationsApi;

  // Auth helpers (thin wrappers over TestApi)
  loginAsNewUser: (opts?: {
    redirect?: string;
    postcode?: string;
    username?: string;
    firstName?: string;
    lastName?: string;
  }) => Promise<{ uid: string; user: any }>;
  loginAsUid: (
    uid: string,
    opts?: {
      redirect?: string;
      email?: string;
      displayName?: string;
      location?: string;
      firstName?: string;
      lastName?: string;
      username?: string;
      skipUpsert?: boolean;
    }
  ) => Promise<void>;
};

export const test = base.extend<TestFixtures>({
  ownerUid: async ({}, use) => {
    await use(process.env.E2E_TEST_UID || "BpSvMxVVpnQeG211hiY8cNPbDCW2");
  },

  // small wrapper so specs don’t need to know the UID
  loginAsOwner: async ({ page, testApi, ownerUid }, use) => {
    await use(async (opts) => {
      await testApi.loginAsUid(page, ownerUid, {
        redirect: opts?.redirect ?? "/projects",
      });
    });
  },

  /* ---------- Auto: clear DB BEFORE every test ---------- */
  cleanUpTestData: [
    async ({ request }, use) => {
      await runSerialized(async () => {
        const res = await postWithRetry(
          request,
          `${API_BASE}${API_PREFIX}/__test__/db/clear`
        );
        pwExpect(res.ok(), "Failed to clear DB (pre-test)").toBeTruthy();
      });
      await use();
    },
    { auto: true },
  ],

  /* ---------- Auto: browser login via custom token ---------- */
  login: [
    async ({ page }, use) => {
      // hygiene: clear storage
      await page.context().clearCookies();
      await page.addInitScript(() => {
        try {
          indexedDB.deleteDatabase("firebaseLocalStorageDb");
        } catch {}
        try {
          localStorage.clear();
        } catch {}
        try {
          sessionStorage.clear();
        } catch {}
      });

      // seed + get custom token
      const api = await pwRequest.newContext({ baseURL: API_BASE });
      const seededEmail = `e2e+${Date.now()}@example.com`;

      // 1) Upsert user row (with derived location columns)
      {
        const tokens = deriveLocationFields("E4");
        const res = await api.post(`${API_PREFIX}/__test__/users`, {
          headers: {
            "X-Test-Secret": TEST_SECRET,
            "Content-Type": "application/json",
          },
          data: {
            uid: TEST_UID,
            email: seededEmail,
            password: "Passw0rd1",
            firstName: "E2E",
            lastName: "User",
            username: `e2e_user_${Date.now()}`,
            // base location + derived fields the server relies on
            location: tokens.location,
            postcode: tokens.postcode,
            postcodeSector: tokens.postcodeSector,
            postcodeOutward: tokens.postcodeOutward,
            city: tokens.city,
          },
        });
        pwExpect(
          res.ok(),
          "upsert /__test__/users should succeed"
        ).toBeTruthy();
      }

      // 2) Custom token
      const tokenRes = await api.post(
        `${API_PREFIX}/__test__/auth/custom-token`,
        {
          headers: {
            "X-Test-Secret": TEST_SECRET,
            "Content-Type": "application/json",
          },
          data: { uid: TEST_UID, email: seededEmail, displayName: "E2E User" },
        }
      );
      pwExpect(
        tokenRes.ok(),
        "custom-token endpoint should succeed"
      ).toBeTruthy();
      const tokenJson = await tokenRes.json();
      const token: string = tokenJson.customToken || tokenJson.token;
      await api.dispose();

      // 3) Client login
      const redirect = "/projects";
      await page.goto(
        `/__test__/login-with-token?token=${encodeURIComponent(
          token
        )}&redirect=${encodeURIComponent(redirect)}`
      );
      await page.waitForURL("**/projects**");

      await use();
    },
    { auto: true },
  ],

  /* ---------- Pages ---------- */
  homePage: async ({ page }, use) => {
    await use(new HomePage(page));
  },
  registerPage: async ({ page }, use) => {
    await use(new RegisterPage(page));
  },
  loginPage: async ({ page }, use) => {
    await use(new LoginPage(page));
  },
  createProjectPage: async ({ page }, use) => {
    await use(new CreateProjectPage(page));
  },
  projectViewPage: async ({ page }, use) => {
    await use(new ProjectViewPage(page));
  },
  basePage: async ({ page }, use) => {
    await use(new BasePage(page));
  },
  projectsPage: async ({ page }, use) => {
    await use(new ProjectsPage(page));
  },
  projectRecommendPage: async ({ page }, use) => {
    await use(new ProjectRecommendPage(page));
  },
  recommendationsPage: async ({ page }, use) => {
    await use(new RecommendationsPage(page));
  },
  accountPage: async ({ page }, use) => {
    await use(new AccountPage(page));
  },

  /* ---------- APIs ---------- */
  usersApi: async ({ request }, use) => {
    await use(new UsersApi(request));
  },

  testApi: async ({ request }, use) => {
    await use(new TestApi(request));
  },

  // Keep fixture *names* in base; plumbing moved to api-factory
  projectsApi: async ({ page }, use) => {
    const api = await createProjectsApiForPage(page);
    await use(api);
  },

  recommendationsApi: async ({ page }, use) => {
    const api = await createRecommendationsApiForPage(page);
    await use(api);
  },

  /* ---------- Auth helpers backed by TestApi (quiet in spec) ---------- */
  loginAsNewUser: async ({ page, testApi }, use) => {
    await use(async (opts) => testApi.loginAsNewUser(page, opts));
  },

  loginAsUid: async ({ page, testApi }, use) => {
    await use(async (uid, opts) => testApi.loginAsUid(page, uid, opts));
  },
});

// Re-export expect
export const expect = test.expect;

/** Runner with auto login DISABLED (for auth/signup specs) */
export const testNoAuth = test.extend({
  login: async ({}, use) => {
    await use();
  },
});
