// e2e-tests/src/fixtures/base-fixture.ts
import { test as base, expect, request as pwRequest } from "@playwright/test";
import type { APIRequestContext } from "@playwright/test";
import { HomePage } from "../pages/HomePage";
import { RegisterPage } from "../pages/RegisterPage";
import { LoginPage } from "../pages/LoginPage";
import { ProjectViewPage } from "../pages/ProjectViewPage";
import { UsersApi } from "../api-utils/users-api";
import { AuthApi } from "../api-utils/auth-api";
import User from "../models/User";
import { CreateProjectPage } from "../pages/CreateProjectPage";
import { BasePage } from "../pages/BasePage";
import { ProjectsPage } from "../pages/ProjectsPage";
import { ProjectRecommendPage } from "../pages/ProjectRecommendPage";
import { AccountPage } from "../pages/AccountPage";

type LoginOpts = {
  redirect?: string;
  assertInitials?: string | boolean;
};

type RequestFactory = (opts: {
  baseURL?: string;
  headers: Record<string, string>;
}) => Promise<APIRequestContext>;

type Fixtures = {
  homePage: HomePage;
  registerPage: RegisterPage;
  loginPage: LoginPage;
  createProjectPage: CreateProjectPage;
  projectViewPage: ProjectViewPage;
  basePage: BasePage;
  projectsPage: ProjectsPage;
  projectRecommendPage: ProjectRecommendPage;
  accountPage: AccountPage;

  usersApi: UsersApi;
  authApi: AuthApi;

  requestFactory: RequestFactory;

  clearDb: void;

  loginAsUid: (
    uid: string,
    opts?: { redirect?: string; assertInitials?: string | boolean }
  ) => Promise<void>;

  loginAsNewUser: (opts?: {
    redirect?: string;
  }) => Promise<{ uid: string; user: User }>;
};

const API_BASE = process.env.E2E_API_BASE || "http://localhost:8787";
const TEST_SECRET = process.env.E2E_TEST_SECRET || "";

/* ------------------ flake hardening ------------------ */

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

const TRANSIENT_ERR_CODES = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "EAI_AGAIN",
]);
const TRANSIENT_STATUS = new Set([502, 503, 504]);

/** POST with retry/backoff for transient hiccups. */
async function postWithRetry(
  request: APIRequestContext,
  url: string,
  body?: Record<string, any>,
  {
    maxRetries = 5,
    baseDelay = 200,
    timeout = 15000,
    headers = {},
  }: {
    maxRetries?: number;
    baseDelay?: number;
    timeout?: number;
    headers?: Record<string, string>;
  } = {}
) {
  let attempt = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const res = await request.post(url, {
        data: body,
        timeout,
        // Connection: close helps some node servers avoid socket reuse bugs
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
      // fall through to retry branch for 502/503/504
    } catch (e: any) {
      const transientNetwork = e?.code && TRANSIENT_ERR_CODES.has(e.code);
      if (!transientNetwork && attempt >= maxRetries) throw e;
    }
    if (attempt++ >= maxRetries) {
      throw new Error(`POST ${url} failed after ${maxRetries + 1} attempts`);
    }
    const delay = baseDelay * Math.pow(2, attempt - 1); // 200, 400, 800, 1600, 3200…
    await sleep(delay + Math.floor(Math.random() * 100)); // jitter
  }
}

/** In-process mutex to serialize destructive calls like DB clear across workers. */
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

/* ------------------ fixtures ------------------ */

export const test = base.extend<Fixtures>({
  page: async ({ page, context }, use) => {
    await context.clearCookies();
    await page.addInitScript(() => {
      try {
        const alreadyCleared = document.cookie.includes("__e2e_cleared=1");
        if (!alreadyCleared) {
          try {
            indexedDB.deleteDatabase("firebaseLocalStorageDb");
          } catch {}
          try {
            localStorage.clear();
          } catch {}
          try {
            sessionStorage.clear();
          } catch {}
          document.cookie = "__e2e_cleared=1; path=/";
        }
      } catch {}
    });
    await use(page);
  },

  clearDb: [
    async ({ request }, use) => {
      // Serialize the destructive clear across parallel workers and
      // rely on retrying POST to ride out server cold starts / socket resets.
      await runSerialized(async () => {
        const res = await postWithRetry(
          request,
          `${API_BASE}/api/__test__/db/clear`
        );
        expect(res.ok(), "Failed to clear DB").toBeTruthy();
      });

      await use(undefined);
    },
    { auto: true },
  ],

  // ----- Pages -----
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
  accountPage: async ({ page }, use) => {
    await use(new AccountPage(page));
  },

  // ----- APIs -----
  usersApi: async ({ request }, use) => {
    await use(new UsersApi(request));
  },
  authApi: async ({ request }, use) => {
    await use(new AuthApi(request));
  },

  /** Lazy APIRequestContext creator */
  requestFactory: async ({}, use) => {
    const fn: RequestFactory = async ({ baseURL = API_BASE, headers }) => {
      return pwRequest.newContext({
        baseURL,
        extraHTTPHeaders: headers,
      });
    };
    await use(fn);
  },

  /** Browser login via custom token helper */
  loginAsUid: async ({ page, authApi }, use) => {
    const fn = async (uid: string, opts?: LoginOpts) => {
      const token = await authApi.customToken(uid);
      const redirect = opts?.redirect ?? "/projects";
      await page.goto(
        `/__test__/login-with-token?token=${encodeURIComponent(
          token
        )}&redirect=${encodeURIComponent(redirect)}`
      );
      await page.waitForLoadState("networkidle");
    };
    await use(fn);
  },

  /** Create a fresh user and log the BROWSER in (one-liner for specs) */
  loginAsNewUser: async ({ page, usersApi, authApi }, use) => {
    const fn = async (opts?: { redirect?: string }) => {
      const user = User.aUser()
        .withEmail(`e2e+${Date.now()}@example.com`)
        .withPostcode("E4")
        .withPassword("Passw0rd1");

      const { uid } = await usersApi.createUser(user);

      const token = await authApi.customToken(uid!);
      const redirect = opts?.redirect ?? "/";
      await page.goto(
        `/__test__/login-with-token?token=${encodeURIComponent(
          token
        )}&redirect=${encodeURIComponent(redirect)}`
      );
      await page.waitForLoadState("networkidle");

      return { uid: uid!, user };
    };
    await use(fn);
  },

  // (No eager ProjectsApi fixture; create it on demand in tests)
});

export { expect } from "@playwright/test";
