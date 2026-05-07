import type { APIRequestContext, Page } from "@playwright/test";

function normalizeBaseUrl(url: string): string {
  const trimmed = String(url || "").trim();
  return trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
}

function normalizeLocalhost(url: string): string {
  return url.replace(/^http:\/\/localhost\b/i, "http://127.0.0.1");
}

function resolveApiBaseUrl(passedBaseUrl: string): string {
  const override = String(process.env.API_BASE_URL || "").trim();
  const chosen = override || String(passedBaseUrl || "").trim();
  return normalizeLocalhost(normalizeBaseUrl(chosen));
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function isRetryableNetworkError(err: unknown) {
  const msg = String((err as any)?.message || err || "");
  return (
    msg.includes("ECONNREFUSED") ||
    msg.includes("ECONNRESET") ||
    msg.includes("ETIMEDOUT") ||
    msg.includes("ENOTFOUND") ||
    msg.includes("fetch failed") ||
    msg.includes("socket hang up")
  );
}

/**
 * Mints a Firebase custom token from the test endpoint with retry/backoff.
 */
async function mintCustomTokenWithRetry(
  request: APIRequestContext,
  url: string,
  secret: string,
  uid: string,
) {
  const deadline = Date.now() + 25_000;
  let attempt = 0;
  let lastError: unknown;

  while (Date.now() < deadline) {
    attempt++;

    try {
      const res = await request.post(url, {
        headers: { "X-Test-Secret": secret },
        data: { uid },
        timeout: 5_000,
      });

      if (res.ok()) {
        const body = (await res.json()) as {
          customToken?: string;
          token?: string;
        };

        const token = body.customToken || body.token;
        if (!token) throw new Error("Missing customToken in response");

        return token;
      }

      if (res.status() >= 500 || res.status() === 429 || res.status() === 408) {
        await sleep(Math.min(1500, 200 + attempt * 150));
        continue;
      }

      const text = await res.text().catch(() => "");
      throw new Error(`Custom token mint failed: ${res.status()} ${text}`);
    } catch (err) {
      lastError = err;

      if (isRetryableNetworkError(err)) {
        await sleep(Math.min(1500, 200 + attempt * 150));
        continue;
      }

      throw err;
    }
  }

  throw new Error(
    `Failed to mint custom token after retries: ${String(lastError)}`,
  );
}

type UiLoginAsUidArgs = {
  request: APIRequestContext;
  apiBaseUrl: string;
  uiBaseUrl: string;
  uid: string;
  page: Page;
};

/**
 * Logs into the UI using a Firebase custom token.
 */
export async function uiLoginAsUid({
  request,
  apiBaseUrl,
  uiBaseUrl,
  uid,
  page,
}: UiLoginAsUidArgs): Promise<void> {
  const userId = String(uid || "").trim();
  if (!userId) throw new Error("Missing uid");

  const testSecret = process.env.E2E_TEST_SECRET;
  if (!testSecret) throw new Error("Missing E2E_TEST_SECRET");

  const apiBase = resolveApiBaseUrl(apiBaseUrl);
  const uiBase = normalizeBaseUrl(uiBaseUrl);

  const tokenUrl = `${apiBase}/api/__test__/auth/custom-token`;

  const customToken = await mintCustomTokenWithRetry(
    request,
    tokenUrl,
    testSecret,
    userId,
  );

  // Race-tolerant navigation: a preceding logout() leaves a redirect
  // from /logout -> /?signedOut=1 in flight. On slow mobile-webkit CI,
  // that redirect can fire AFTER our goto has started, producing
  // "Navigation to '/' is interrupted by another navigation to
  // '/?signedOut=1'". Catch that one specific error and retry once -
  // the retry lands cleanly because the redirect has settled by then.
  async function gotoBaseOnce() {
    return page.goto(uiBase, { waitUntil: "domcontentloaded" });
  }
  try {
    await gotoBaseOnce();
  } catch (err: unknown) {
    const msg = String((err as Error)?.message || err || "");
    if (msg.includes("interrupted by another navigation")) {
      await page.waitForLoadState("domcontentloaded").catch(() => {});
      await gotoBaseOnce();
    } else {
      throw err;
    }
  }

  await page.waitForFunction(
    () => {
      const w = window as any;
      const auth =
        w?.firebaseAuth ||
        w?.auth ||
        (typeof w?.firebase?.auth === "function" ? w.firebase.auth() : null);

      return Boolean(
        auth &&
        (typeof auth.signInWithCustomToken === "function" ||
          typeof w.signInWithCustomToken === "function"),
      );
    },
    { timeout: 30_000 },
  );

  await page.evaluate(
    async ({ token, expectedUid }) => {
      const w = window as any;

      const auth =
        w.firebaseAuth ||
        w.auth ||
        (typeof w.firebase?.auth === "function" ? w.firebase.auth() : null);

      if (!auth) throw new Error("Firebase auth not available");

      if (typeof auth.signInWithCustomToken === "function") {
        await auth.signInWithCustomToken(token);
      } else if (typeof w.signInWithCustomToken === "function") {
        await w.signInWithCustomToken(auth, token);
      } else {
        throw new Error("signInWithCustomToken not available");
      }

      const user = auth.currentUser;
      if (!user) throw new Error("User missing after sign-in");

      await user.getIdToken(true);

      // Block until Firebase has flushed the auth state to IndexedDB.
      // Without this, navigating away can land on a fresh page whose
      // Firebase observer rehydrates BEFORE our write commits — the new
      // page sees `null` user and AuthedOnly bounces to /login. The
      // `authStateReady()` API (Firebase JS SDK 9.5+) resolves once the
      // first state has been emitted AND persisted; falling back to a
      // single onAuthStateChanged tick covers older SDKs.
      if (typeof auth.authStateReady === "function") {
        await auth.authStateReady();
      } else if (typeof auth.onAuthStateChanged === "function") {
        await new Promise<void>((resolve) => {
          const unsub = auth.onAuthStateChanged(() => {
            unsub?.();
            resolve();
          });
        });
      }

      w.__e2eSignedInUid = expectedUid;
    },
    { token: customToken, expectedUid: userId },
  );

  await page.waitForFunction(
    (expected) => (window as any).__e2eSignedInUid === expected,
    userId,
    { timeout: 10_000 },
  );

  await page.goto("about:blank");
}
