import { type APIRequestContext, expect, type Page } from "@playwright/test";

const API_PREFIX = process.env.E2E_API_PREFIX || "/api";
const TEST_SECRET = process.env.E2E_TEST_SECRET || "";

/* Keep server-friendly location tokens in every upsert */
function deriveLocationFields(raw?: string) {
  const loc = String(raw || "")
    .trim()
    .toUpperCase();
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

export class TestApi {
  constructor(private readonly request: APIRequestContext) {}

  async clearDb(): Promise<void> {
    const res = await this.request.post(`${API_PREFIX}/__test__/db/clear`, {
      headers: { "X-Test-Secret": TEST_SECRET, Connection: "close" },
    });
    expect(res.ok(), `Failed to clear DB: ${await res.text()}`).toBeTruthy();
  }

  /** Idempotent upsert by raw fields (now includes derived location cols) */
  async upsertUser(input: {
    uid?: string;
    email: string;
    password?: string;
    firstName?: string;
    lastName?: string;
    username?: string;
    location?: string; // e.g. "E4"
  }): Promise<{ uid: string }> {
    const tokens = deriveLocationFields(input.location ?? "E4");

    const res = await this.request.post(`${API_PREFIX}/__test__/users`, {
      headers: {
        "X-Test-Secret": TEST_SECRET,
        "Content-Type": "application/json",
      },
      data: {
        uid: input.uid,
        email: input.email,
        password: input.password ?? "Passw0rd1",
        firstName: input.firstName ?? "E2E",
        lastName: input.lastName ?? "User",
        username: input.username ?? `e2e_user_${Date.now()}`,
        // Set both the base and derived fields used by your server
        location: tokens.location,
        postcode: tokens.postcode,
        postcodeSector: tokens.postcodeSector,
        postcodeOutward: tokens.postcodeOutward,
        city: tokens.city,
      },
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

  /** Logs the given page in as a specific uid (clears storage, ensures user exists, navigates with token). */
  async loginAsUid(
    page: Page,
    uid: string,
    opts?: {
      email?: string;
      displayName?: string;
      redirect?: string;
      location?: string; // e.g. "E4"
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

    if (!opts?.skipUpsert) {
      await this.upsertUser({
        uid,
        email,
        firstName: opts?.firstName ?? "E2E",
        lastName: opts?.lastName ?? "User",
        username: opts?.username ?? `e2e_user_${Date.now()}`,
        location: opts?.location ?? "E4",
        password: "Passw0rd1",
      });
    }

    // get a custom token and log in via the test-only route
    const token = await this.customToken(
      uid,
      email,
      opts?.displayName ?? "E2E User"
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
   * Creates a new user (optionally in a postcode) and logs in on the given page.
   * Returns the uid and a minimal user-like object (email/location).
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
    const email = `e2e+${Date.now()}@example.com`;
    const username = opts?.username ?? `e2e_user_${Date.now()}`;
    const firstName = opts?.firstName ?? "E2E";
    const lastName = opts?.lastName ?? "User";
    const location = opts?.postcode ?? "E4";

    const { uid } = await this.upsertUser({
      email,
      username,
      firstName,
      lastName,
      location,
      password: "Passw0rd1",
    });

    await this.loginAsUid(page, uid, {
      email,
      displayName: `${firstName} ${lastName}`,
      redirect: opts?.redirect ?? "/projects",
      location,
      firstName,
      lastName,
      username,
      skipUpsert: true, // already upserted above
    });

    return { uid, user: { email, username, firstName, lastName, location } };
  }
}
