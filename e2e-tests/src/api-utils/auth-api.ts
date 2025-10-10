// e2e-tests/src/api-utils/auth-api.ts
import type { APIRequestContext } from "@playwright/test";
import { expect } from "@playwright/test";

const API_BASE = process.env.E2E_API_BASE || "http://localhost:8787";
const TEST_SECRET = process.env.E2E_TEST_SECRET || "";

function snippet(s: string, n = 400) {
  return (s || "").slice(0, n);
}

export class AuthApi {
  constructor(private request: APIRequestContext) {}

  /** Mint a Firebase custom token for a UID (test-only route). */
  async customToken(uid: string): Promise<string> {
    const res = await this.request.post(
      `${API_BASE}/api/__test__/auth/custom-token`,
      {
        headers: {
          "X-Test-Secret": TEST_SECRET,
          "Content-Type": "application/json",
        },
        data: { uid },
      }
    );

    const raw = await res.text();
    let body: any;
    try {
      body = raw ? JSON.parse(raw) : {};
    } catch {
      throw new Error(
        `[customToken] Expected JSON, got ${res.status()}: ${snippet(raw)}`
      );
    }

    expect(res.ok(), `customToken failed: ${raw}`).toBeTruthy();
    if (!body?.token) throw new Error(`[customToken] Missing "token": ${raw}`);
    return body.token as string;
  }

  /** Exchange a UID for a Firebase ID token (test-only route). */
  async idTokenForUid(uid: string): Promise<string> {
    const res = await this.request.post(
      `${API_BASE}/api/__test__/auth/id-token`,
      {
        headers: {
          "X-Test-Secret": TEST_SECRET,
          "Content-Type": "application/json",
        },
        data: { uid },
      }
    );

    const raw = await res.text();
    let body: any;
    try {
      body = raw ? JSON.parse(raw) : {};
    } catch {
      throw new Error(
        `[idTokenForUid] Expected JSON, got ${res.status()}: ${snippet(
          raw
        )}\nHint: ensure POST /api/__test__/auth/id-token exists and returns { idToken }`
      );
    }

    expect(res.ok(), `idTokenForUid failed: ${raw}`).toBeTruthy();
    if (!body?.idToken)
      throw new Error(`[idTokenForUid] Missing "idToken": ${raw}`);
    return body.idToken as string;
  }
}
