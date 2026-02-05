import type { APIRequestContext, Page } from "@playwright/test";

export async function uiLoginAsUid(args: {
  request: APIRequestContext;
  apiBaseUrl: string;
  uiBaseUrl: string;
  uid: string;
  page: Page;
}) {
  const { request, apiBaseUrl, uiBaseUrl, uid, page } = args;

  const secret = process.env.E2E_TEST_SECRET;
  if (!secret) throw new Error("Missing E2E_TEST_SECRET");

  // 1. Mint custom token
  const res = await request.post(
    `${apiBaseUrl}/api/__test__/auth/custom-token`,
    {
      headers: { "X-Test-Secret": secret },
      data: { uid },
    },
  );

  if (!res.ok()) {
    throw new Error(`Failed to mint custom token: ${res.status()}`);
  }

  const body: any = await res.json();
  const token = body?.customToken || body?.token;
  if (!token) throw new Error("Missing customToken from server");

  // 2. Load UI
  await page.goto(uiBaseUrl, { waitUntil: "domcontentloaded" });

  // 3. Wait for Firebase to exist on window (mobile-safe)
  await page.waitForFunction(() => {
    const w = window as any;
    return w?.firebaseAuth || w?.auth || w?.firebase?.auth;
  });

  // 4. Sign in via Firebase
  await page.evaluate(
    async ({ token }) => {
      const w = window as any;

      const auth =
        w.firebaseAuth ||
        w.auth ||
        (typeof w.firebase?.auth === "function" ? w.firebase.auth() : null);

      if (!auth) {
        throw new Error("Firebase auth not available after wait");
      }

      const signIn =
        w.signInWithCustomToken || w.firebase?.auth?.signInWithCustomToken;

      if (!signIn) {
        throw new Error("signInWithCustomToken not available");
      }

      await signIn(auth, token);
    },
    { token },
  );
}
