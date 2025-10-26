import { type APIRequestContext, expect, type Page } from "@playwright/test";

const API_PREFIX = process.env.E2E_API_PREFIX || "/api";
const TEST_SECRET = process.env.E2E_TEST_SECRET || "";

export class TestApi {
  constructor(private readonly request: APIRequestContext) {}

  async clearDb(): Promise<void> {
    const res = await this.request.post(`${API_PREFIX}/__test__/db/clear`, {
      headers: { "X-Test-Secret": TEST_SECRET, Connection: "close" },
    });
    expect(res.ok(), `Failed to clear DB: ${await res.text()}`).toBeTruthy();
  }

  /** Idempotent upsert by raw fields — sends ONLY provided fields (no default clobbering). */
  async upsertUser(input: {
    uid?: string;
    email: string;
    password?: string;
    firstName?: string;
    lastName?: string;
    username?: string;
    location?: string;
  }): Promise<{ uid: string }> {
    const data: any = { email: input.email };
    if (input.uid !== undefined) data.uid = input.uid;
    if (input.password !== undefined) data.password = input.password;
    if (input.firstName !== undefined) data.firstName = input.firstName;
    if (input.lastName !== undefined) data.lastName = input.lastName;
    if (input.username !== undefined) data.username = input.username;
    if (input.location !== undefined) data.location = input.location;

    const res = await this.request.post(`${API_PREFIX}/__test__/users`, {
      headers: {
        "X-Test-Secret": TEST_SECRET,
        "Content-Type": "application/json",
      },
      data,
    });
    expect(res.ok(), `Upsert user failed: ${await res.text()}`).toBeTruthy();
    const json = await res.json();
    const uid = json?.uid || input.uid;
    expect(uid, "server did not return uid and none was supplied").toBeTruthy();
    return { uid };
  }

  /** Convenience: accept your existing User model instance */
  async createUserFromModel(user: any): Promise<{ uid: string }> {
    const payload = {
      email: user.email,
      password: user.password,
      firstName: user.firstName,
      lastName: user.lastName,
      username: user.username,
      location: user.postcode ?? user.location,
    };
    return this.upsertUser(payload as any);
  }

  async customToken(
    uid: string,
    email: string,
    displayName = "E2E User"
  ): Promise<string> {
    const res = await this.request.post(
      `${API_PREFIX}/__test__/auth/custom-token`,
      {
        headers: {
          "X-Test-Secret": TEST_SECRET,
          "Content-Type": "application/json",
        },
        data: { uid, email, displayName },
      }
    );
    expect(res.ok(), `custom-token failed: ${await res.text()}`).toBeTruthy();
    const json = await res.json();
    return json.customToken || json.token;
  }

  /* ---------------- Browser-login helpers ---------------- */

  /** Logs the given page in as a specific uid (optional upsert with provided fields). */
  async loginAsUid(
    page: Page,
    uid: string,
    opts?: {
      email?: string;
      displayName?: string;
      redirect?: string;
      location?: string;
      firstName?: string;
      lastName?: string;
      username?: string;
      skipUpsert?: boolean;
    }
  ): Promise<void> {
    const email = opts?.email ?? `e2e+${uid}.${Date.now()}@example.com`;

    // hygiene: clear client storage to avoid session clashes
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

    // Optionally ensure user row exists with the provided fields (no clobbering defaults internally)
    if (!opts?.skipUpsert) {
      await this.upsertUser({
        uid,
        email,
        firstName: opts?.firstName,
        lastName: opts?.lastName,
        username: opts?.username,
        location: opts?.location,
      });
    }

    // get a custom token and log in via the test-only route
    const token = await this.customToken(
      uid,
      email,
      opts?.displayName ??
        `${opts?.firstName ?? "E2E"} ${opts?.lastName ?? "User"}`
    );
    const redirect = opts?.redirect ?? "/projects";
    await page.goto(
      `/__test__/login-with-token?token=${encodeURIComponent(
        token
      )}&redirect=${encodeURIComponent(redirect)}`
    );
    await page.waitForLoadState("networkidle");
  }

  /**
   * Creates a new user (optionally with name/username/postcode) and logs in on the given page.
   * Returns the uid and a minimal user-like object.
   */
  async loginAsNewUser(
    page: Page,
    opts?: {
      redirect?: string;
      postcode?: string;
      username?: string;
      firstName?: string;
      lastName?: string;
    }
  ): Promise<{ uid: string; user: any }> {
    const firstName = opts?.firstName ?? "E2E";
    const lastName = opts?.lastName ?? "User";
    const email = `e2e+${Date.now()}@example.com`;
    const username = opts?.username ?? `e2e_user_${Date.now()}`;
    const location = opts?.postcode ?? "E4";

    const { uid } = await this.upsertUser({
      email,
      username,
      firstName,
      lastName,
      location,
      // optional password not needed for token-based login
    });

    // Log in without re-upserting (prevents clobbering the names/username)
    await this.loginAsUid(page, uid, {
      email,
      displayName: `${firstName} ${lastName}`,
      redirect: opts?.redirect ?? "/projects",
      location,
      firstName,
      lastName,
      username,
      skipUpsert: true,
    });

    return { uid, user: { email, username, firstName, lastName, location } };
  }
}
