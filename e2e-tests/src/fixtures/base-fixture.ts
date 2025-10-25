// e2e-tests/src/fixtures/base-fixture.ts
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

/* ===== Env (with sensible defaults for local dev) ===== */
const API_BASE = process.env.E2E_API_BASE || "http://localhost:8787";
const API_PREFIX = process.env.E2E_API_PREFIX || "/api";
const TEST_SECRET = process.env.E2E_TEST_SECRET || "";
const TEST_UID = process.env.E2E_TEST_UID || "BpSvMxVVpnQeG211hiY8cNPbDCW2"; // fallback UID

type TestFixtures = {
  login: void; // auto login (server-backed)
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
  scopes: string[];
  usersApi: UsersApi;
};

export const test = base.extend<TestFixtures>({
  scopes: async ({}, use) => {
    await use(["owner"]);
  },

  // Real login via custom token -> /__test__/login-with-token (no Firebase on client)
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

      // Seed/complete the user's profile (idempotent upsert) BEFORE getting a token
      const api = await pwRequest.newContext({ baseURL: API_BASE });

      // use ONE email everywhere so Firebase Auth and your DB agree
      const seededEmail = `e2e+${Date.now()}@example.com`;

      // 1) Upsert user row with complete profile
      {
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
            location: "E4",
          },
        });
        pwExpect(
          res.ok(),
          "upsert /__test__/users should succeed"
        ).toBeTruthy();
      }

      // 2) Fetch a custom token AND ensure Firebase Auth user has email/displayName
      const tokenRes = await api.post(
        `${API_PREFIX}/__test__/auth/custom-token`,
        {
          headers: {
            "X-Test-Secret": TEST_SECRET,
            "Content-Type": "application/json",
          },
          data: {
            uid: TEST_UID,
            email: seededEmail, // <-- IMPORTANT: sets/updates Firebase Auth email
            // password: "Passw0rd1",   // optional: enable email+password login too
            displayName: "E2E User", // optional: populate displayName
          },
        }
      );
      pwExpect(
        tokenRes.ok(),
        "custom-token endpoint should succeed"
      ).toBeTruthy();
      const tokenJson = await tokenRes.json();
      const token: string = tokenJson.customToken || tokenJson.token;
      await api.dispose();

      // 3) Hit your test-only page that performs signInWithCustomToken on the client
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
  recommendationsPage: async ({ page }, use) => {
    await use(new RecommendationsPage(page));
  },
  accountPage: async ({ page }, use) => {
    await use(new AccountPage(page));
  },
  usersApi: async ({ request }, use) => {
    await use(new UsersApi(request));
  }
});

// Re-export expect
export const expect = test.expect;

/** Test runner with auto login DISABLED for auth/signup specs */
export const testNoAuth = test.extend({
  login: async ({}, use) => {
    await use();
  },
});

// import { test as base, expect, request as pwRequest } from "@playwright/test";
// import type { APIRequestContext, APIResponse } from "@playwright/test";
// import { HomePage } from "../pages/HomePage";
// import { RegisterPage } from "../pages/RegisterPage";
// import { LoginPage } from "../pages/LoginPage";
// import { ProjectViewPage } from "../pages/ProjectViewPage";
// import { UsersApi } from "../api-utils/users-api";
// import { AuthApi } from "../api-utils/auth-api";
// import User from "../models/User";
// import { CreateProjectPage } from "../pages/CreateProjectPage";
// import { BasePage } from "../pages/BasePage";
// import { ProjectsPage } from "../pages/ProjectsPage";
// import { ProjectRecommendPage } from "../pages/ProjectRecommendPage";
// import { RecommendationsPage } from "../pages/RecommendationsPage";
// import { AccountPage } from "../pages/AccountPage";

// type LoginOpts = {
//   redirect?: string;
//   assertInitials?: string | boolean;
// };

// type RequestFactory = (opts: {
//   baseURL?: string;
//   headers: Record<string, string>;
// }) => Promise<APIRequestContext>;

// type RecommendationsApiLike = {
//   createOne(
//     projectId: number,
//     input: {
//       name: string;
//       email?: string | null;
//       phone?: string | null;
//       company: string;
//       comment: string;
//       rating?: number;
//       source?: "magic" | "platform";
//       photos?: { name: string; mimeType: string; buffer: Buffer }[] | null;
//     }
//   ): Promise<number>;
//   createWithPhotos(
//     projectId: number,
//     input: {
//       name: string;
//       email?: string | null;
//       phone?: string | null;
//       company: string;
//       comment: string;
//       rating?: number;
//       source?: "magic" | "platform";
//       photos?: { name: string; mimeType: string; buffer: Buffer }[] | null;
//     }
//   ): Promise<number>;
//   createMany(
//     projectId: number,
//     inputs: {
//       name: string;
//       email?: string | null;
//       phone?: string | null;
//       company: string;
//       comment: string;
//       rating?: number;
//       source?: "magic" | "platform";
//       photos?: { name: string; mimeType: string; buffer: Buffer }[] | null;
//     }[]
//   ): Promise<number[]>;
//   createManySmart(
//     projectId: number,
//     inputs: Array<{
//       name: string;
//       email?: string | null;
//       phone?: string | null;
//       company: string;
//       comment: string;
//       rating?: number;
//       source?: "magic" | "platform";
//       photos?: { name: string; mimeType: string; buffer: Buffer }[] | null;
//     }>
//   ): Promise<number[]>;
//   like(recommendationId: number): Promise<void>;
//   likeMany(ids: number[]): Promise<void>;
// };

// type Fixtures = {
//   homePage: HomePage;
//   registerPage: RegisterPage;
//   loginPage: LoginPage;
//   createProjectPage: CreateProjectPage;
//   projectViewPage: ProjectViewPage;
//   basePage: BasePage;
//   projectsPage: ProjectsPage;
//   projectRecommendPage: ProjectRecommendPage;
//   recommendationsPage: RecommendationsPage;
//   accountPage: AccountPage;

//   usersApi: UsersApi;
//   authApi: AuthApi;

//   recommendationsApiForUser: (opts?: {
//     uid?: string;
//     baseURL?: string;
//   }) => Promise<RecommendationsApiLike>;

//   requestFactory: RequestFactory;

//   clearDb: void;

//   loginAsUid: (
//     uid: string,
//     opts?: { redirect?: string; assertInitials?: string | boolean }
//   ) => Promise<void>;

//   loginAsNewUser: (opts?: {
//     redirect?: string;
//   }) => Promise<{ uid: string; user: User }>;
// };

// const API_BASE = process.env.E2E_API_BASE || "http://localhost:8787";
// /**
//  * IMPORTANT:
//  * - If you mounted v2 router at /api/v2, set E2E_API_PREFIX=/api/v2
//  * - If you mounted it also at /api (legacy), leave default /api
//  */
// const API_PREFIX = process.env.E2E_API_PREFIX || "/api";
// const TEST_SECRET = process.env.E2E_TEST_SECRET || "";

// /* ------------------ flake hardening ------------------ */

// function sleep(ms: number) {
//   return new Promise((r) => setTimeout(r, ms));
// }

// const TRANSIENT_ERR_CODES = new Set([
//   "ECONNRESET",
//   "ECONNREFUSED",
//   "EAI_AGAIN",
// ]);
// const TRANSIENT_STATUS = new Set([502, 503, 504]);

// async function postWithRetry(
//   request: APIRequestContext,
//   url: string,
//   body?: Record<string, any>,
//   {
//     maxRetries = 5,
//     baseDelay = 200,
//     timeout = 15000,
//     headers = {},
//   }: {
//     maxRetries?: number;
//     baseDelay?: number;
//     timeout?: number;
//     headers?: Record<string, string>;
//   } = {}
// ) {
//   let attempt = 0;
//   while (true) {
//     try {
//       const res = await request.post(url, {
//         data: body,
//         timeout,
//         headers: {
//           "X-Test-Secret": TEST_SECRET,
//           Connection: "close",
//           ...headers,
//         },
//       });
//       if (res.ok()) return res;
//       if (!TRANSIENT_STATUS.has(res.status())) {
//         const text = await res.text().catch(() => "");
//         throw new Error(`HTTP ${res.status()} ${text}`);
//       }
//     } catch (e: any) {
//       const transientNetwork = e?.code && TRANSIENT_ERR_CODES.has(e.code);
//       if (!transientNetwork && attempt >= maxRetries) throw e;
//     }
//     if (attempt++ >= maxRetries) {
//       throw new Error(`POST ${url} failed after ${maxRetries + 1} attempts`);
//     }
//     const delay = baseDelay * Math.pow(2, attempt - 1);
//     await sleep(delay + Math.floor(Math.random() * 100)); // jitter
//   }
// }

// const runSerialized = (() => {
//   let tail = Promise.resolve();
//   return async <T>(fn: () => Promise<T>): Promise<T> => {
//     let release!: () => void;
//     const next = new Promise<void>((r) => (release = r));
//     const prev = tail;
//     tail = tail.then(() => next);
//     await prev;
//     try {
//       return await fn();
//     } finally {
//       release();
//     }
//   };
// })();

// /* ------------------ fixtures ------------------ */

// export const test = base.extend<Fixtures>({
//   page: async ({ page, context }, use) => {
//     await context.clearCookies();
//     await page.addInitScript(() => {
//       try {
//         const alreadyCleared = document.cookie.includes("__e2e_cleared=1");
//         if (!alreadyCleared) {
//           try {
//             indexedDB.deleteDatabase("firebaseLocalStorageDb");
//           } catch {}
//           try {
//             localStorage.clear();
//           } catch {}
//           try {
//             sessionStorage.clear();
//           } catch {}
//           document.cookie = "__e2e_cleared=1; path=/";
//         }
//       } catch {}
//     });
//     await use(page);
//   },

//   clearDb: [
//     async ({ request }, use) => {
//       await runSerialized(async () => {
//         const res = await postWithRetry(
//           request,
//           `${API_BASE}${API_PREFIX}/__test__/db/clear`
//         );
//         expect(res.ok(), "Failed to clear DB").toBeTruthy();
//       });

//       await use(undefined);
//     },
//     { auto: true },
//   ],

//   // ----- Pages -----
//   homePage: async ({ page }, use) => {
//     await use(new HomePage(page));
//   },
//   registerPage: async ({ page }, use) => {
//     await use(new RegisterPage(page));
//   },
//   loginPage: async ({ page }, use) => {
//     await use(new LoginPage(page));
//   },
//   createProjectPage: async ({ page }, use) => {
//     await use(new CreateProjectPage(page));
//   },
//   projectViewPage: async ({ page }, use) => {
//     await use(new ProjectViewPage(page));
//   },
//   basePage: async ({ page }, use) => {
//     await use(new BasePage(page));
//   },
//   projectsPage: async ({ page }, use) => {
//     await use(new ProjectsPage(page));
//   },
//   projectRecommendPage: async ({ page }, use) => {
//     await use(new ProjectRecommendPage(page));
//   },
//   recommendationsPage: async ({ page }, use) => {
//     await use(new RecommendationsPage(page));
//   },
//   accountPage: async ({ page }, use) => {
//     await use(new AccountPage(page));
//   },

//   // ----- APIs -----
//   usersApi: async ({ request }, use) => {
//     await use(new UsersApi(request));
//   },
//   authApi: async ({ request }, use) => {
//     await use(new AuthApi(request));
//   },

//   /**
//    * Returns a lightweight Recommendations API client bound to a specific user.
//    */
//   recommendationsApiForUser: async ({ usersApi, authApi }, use) => {
//     const factory = async (opts?: {
//       uid?: string;
//       baseURL?: string;
//     }): Promise<RecommendationsApiLike> => {
//       // 1) Ensure we have a user identity
//       let uid = opts?.uid;
//       if (!uid) {
//         const res = await usersApi.createUser({
//           email: `e2e+${Date.now()}@example.com`,
//           postcode: "E4",
//           password: "Passw0rd1",
//         });
//         uid = res.uid!;
//       }

//       // 2) Auth as that user
//       const idToken = await authApi.idTokenForUid(uid);
//       const baseURL = opts?.baseURL || API_BASE;

//       // 3) Build an authed request context (IMPORTANT: no default Content-Type)
//       const ctx = await pwRequest.newContext({
//         baseURL,
//         extraHTTPHeaders: {
//           Authorization: `Bearer ${idToken}`,
//           "X-Test-Secret": TEST_SECRET,
//         },
//       });

//       // Helper: normalize created id
//       async function extractId(res: APIResponse): Promise<number> {
//         const raw = await res.text();
//         let json: any = {};
//         try {
//           json = raw ? JSON.parse(raw) : {};
//         } catch {
//           throw new Error(
//             `Expected JSON from recommendations endpoint (${res.status()}): ${raw}`
//           );
//         }
//         const id =
//           json?.recommendationId ??
//           json?.recommendation?.id ??
//           json?.id ??
//           null;
//         expect(typeof id).toBe("number");
//         return id as number;
//       }

//       const client: RecommendationsApiLike = {
//         async createOne(projectId, input) {
//           const res = await ctx.post(
//             `${API_PREFIX}/projects/${projectId}/recommendations`,
//             {
//               headers: { "Content-Type": "application/json" },
//               data: {
//                 name: input.name,
//                 email: input.email ?? undefined,
//                 phone: input.phone ?? undefined,
//                 company: input.company,
//                 comment: input.comment,
//                 rating: input.rating ?? 5,
//                 ...(input.source ? { source: input.source } : {}),
//               },
//             }
//           );
//           expect(
//             res.ok(),
//             `Failed to create recommendation: ${await res.text()}`
//           ).toBeTruthy();
//           return extractId(res);
//         },

//         /** Sends ONE photo (the first) because Playwright multipart doesn't accept arrays per key. */
//         async createWithPhotos(projectId, input) {
//           const fields: Record<string, any> = {
//             name: input.name,
//             company: input.company,
//             comment: input.comment,
//             rating: String(input.rating ?? 5),
//           };
//           if (input.email) fields.email = input.email;
//           if (input.phone) fields.phone = input.phone;
//           if (input.source) fields.source = input.source;

//           const first = input.photos?.[0];
//           if (first) {
//             // Single field named "photos" with a single file object
//             fields.photos = {
//               name: first.name,
//               mimeType: first.mimeType,
//               buffer: first.buffer,
//             };
//           }

//           const res = await ctx.post(
//             `${API_PREFIX}/projects/${projectId}/recommendations`,
//             { multipart: fields }
//           );
//           expect(
//             res.ok(),
//             `Failed to create recommendation with photos: ${await res.text()}`
//           ).toBeTruthy();

//           return extractId(res);
//         },

//         async createMany(projectId, inputs) {
//           const ids: number[] = [];
//           for (const input of inputs) {
//             ids.push(await this.createOne(projectId, input));
//           }
//           return ids;
//         },

//         /** Mixed creator: if photos present, uses multipart, otherwise JSON. */
//         async createManySmart(projectId, inputs) {
//           const ids: number[] = [];
//           for (const it of inputs) {
//             const id = it.photos?.length
//               ? await this.createWithPhotos(projectId, it as any)
//               : await this.createOne(projectId, it);
//             ids.push(id);
//           }
//           return ids;
//         },

//         async like(recommendationId) {
//           const res = await ctx.post(
//             `${API_PREFIX}/recommendations/${recommendationId}/like`,
//             { data: { value: 1 } }
//           );
//           expect(
//             res.ok(),
//             `Failed to like recommendation ${recommendationId}: ${await res.text()}`
//           ).toBeTruthy();
//         },

//         async likeMany(ids) {
//           for (const id of ids) await this.like(id);
//         },
//       };

//       return client;
//     };

//     await use(factory);
//   },

//   requestFactory: async ({}, use) => {
//     const fn: RequestFactory = async ({ baseURL = API_BASE, headers }) => {
//       return pwRequest.newContext({
//         baseURL,
//         extraHTTPHeaders: headers,
//       });
//     };
//     await use(fn);
//   },

//   loginAsUid: async ({ page, authApi }, use) => {
//     const fn = async (uid: string, opts?: LoginOpts) => {
//       const token = await authApi.customToken(uid);
//       const redirect = opts?.redirect ?? "/projects";
//       await page.goto(
//         `/__test__/login-with-token?token=${encodeURIComponent(
//           token
//         )}&redirect=${encodeURIComponent(redirect)}`
//       );
//       await page.waitForLoadState("networkidle");
//     };
//     await use(fn);
//   },

//   loginAsNewUser: async ({ page, usersApi, authApi }, use) => {
//     const fn = async (opts?: { redirect?: string }) => {
//       const user = User.aUser()
//         .withEmail(`e2e+${Date.now()}@example.com`)
//         .withPostcode("E4")
//         .withPassword("Passw0rd1");

//       const { uid } = await usersApi.createUser(user);

//       const token = await authApi.customToken(uid!);
//       const redirect = opts?.redirect ?? "/";
//       await page.goto(
//         `/__test__/login-with-token?token=${encodeURIComponent(
//           token
//         )}&redirect=${encodeURIComponent(redirect)}`
//       );
//       await page.waitForLoadState("networkidle");

//       return { uid: uid!, user };
//     };
//     await use(fn);
//   },
// });

// export { expect } from "@playwright/test";
