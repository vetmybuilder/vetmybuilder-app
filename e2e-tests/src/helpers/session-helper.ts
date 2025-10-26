import {
  type Page,
  request as pwRequest,
  type APIRequestContext,
} from "@playwright/test";

const API_BASE = process.env.E2E_API_BASE || "http://localhost:8787";
const API_PREFIX = process.env.E2E_API_PREFIX || "/api";
const TEST_UID = process.env.E2E_TEST_UID || "BpSvMxVVpnQeG211hiY8cNPbDCW2";

export async function loginSession(
  page: Page,
  opts?: { redirect?: string; email?: string }
) {
  const email = opts?.email ?? `e2e+${Date.now()}@example.com`;

  // Seed + get custom token (server test endpoints)
  const bootstrap = await pwRequest.newContext({ baseURL: API_BASE });
  await bootstrap.post(`${API_PREFIX}/__test__/users`, {
    headers: {
      "X-Test-Secret": process.env.E2E_TEST_SECRET || "",
      "Content-Type": "application/json",
    },
    data: {
      uid: TEST_UID,
      email,
      firstName: "E2E",
      lastName: "User",
      username: `e2e_user_${Date.now()}`,
      location: "E4",
      password: "Passw0rd1",
    },
  });
  const tokenRes = await bootstrap.post(
    `${API_PREFIX}/__test__/auth/custom-token`,
    {
      headers: {
        "X-Test-Secret": process.env.E2E_TEST_SECRET || "",
        "Content-Type": "application/json",
      },
      data: { uid: TEST_UID, email, displayName: "E2E User" },
    }
  );
  const tokenJson = await tokenRes.json();
  const customToken: string = tokenJson.customToken || tokenJson.token;
  await bootstrap.dispose();

  // Clean storage + client-side signInWithCustomToken
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

  const redirect = opts?.redirect ?? "/projects";
  await page.goto(
    `/__test__/login-with-token?token=${encodeURIComponent(
      customToken
    )}&redirect=${encodeURIComponent(redirect)}`
  );
  await page.waitForURL("**/projects**");

  // Helper to read Firebase ID token from localStorage
  async function idToken(): Promise<string> {
    const tok = await page.evaluate(async () => {
      function fromLS(): string | null {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (!k || !k.startsWith("firebase:authUser:")) continue;
          const raw = localStorage.getItem(k);
          if (!raw) continue;
          try {
            const obj = JSON.parse(raw);
            const t = obj?.stsTokenManager?.accessToken;
            if (t && typeof t === "string") return t;
          } catch {}
        }
        return null;
      }
      let t = fromLS();
      if (t) return t;
      const start = Date.now();
      while (Date.now() - start < 5000) {
        await new Promise((r) => setTimeout(r, 100));
        t = fromLS();
        if (t) return t;
      }
      return "";
    });
    if (!tok)
      throw new Error("Failed to obtain Firebase ID token from browser");
    return tok;
  }

  // Factory for authed APIRequestContext (Bearer auth)
  async function authedRequest(): Promise<APIRequestContext> {
    const t = await idToken();
    return pwRequest.newContext({
      baseURL: API_BASE,
      extraHTTPHeaders: {
        Authorization: `Bearer ${t}`,
        "Content-Type": "application/json",
      },
    });
  }

  return { email, uid: TEST_UID, idToken, authedRequest };
}
