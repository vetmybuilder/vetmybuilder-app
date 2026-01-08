import { expect, type APIRequestContext } from "@playwright/test";

type AccountExpectation = {
  firstName?: string | null;
  lastName?: string | null;
  username?: string | null;
};

export function api(
  request: APIRequestContext,
  baseUrl: string,
  bearerToken?: string
) {
  const headers = bearerToken
    ? { Authorization: `Bearer ${bearerToken}` }
    : undefined;

  async function getJson(path: string) {
    const res = await request.get(baseUrl + path, { headers });
    const json = await res.json().catch(() => null);
    return { res, json };
  }

  async function waitForAccount(expected: AccountExpectation) {
    await expect
      .poll(async () => {
        const { res, json } = await getJson("/api/account");
        if (res.status() !== 200) return false;

        const user = json?.user;
        if (!user) return false;

        if (
          expected.firstName !== undefined &&
          user.firstName !== expected.firstName
        )
          return false;
        if (
          expected.lastName !== undefined &&
          user.lastName !== expected.lastName
        )
          return false;
        if (
          expected.username !== undefined &&
          user.username !== expected.username
        )
          return false;

        return true;
      })
      .toBe(true);

    const { json } = await getJson("/api/account");
    return json?.user ?? null;
  }

  return {
    get: (path: string) => request.get(baseUrl + path, { headers }),
    post: (path: string, data?: any) =>
      request.post(baseUrl + path, { data, headers }),
    put: (path: string, data?: any) =>
      request.put(baseUrl + path, { data, headers }),
    del: (path: string) => request.delete(baseUrl + path, { headers }),

    getJson,
    waitForAccount,
  };
}

export async function authedApiForUid(
  request: APIRequestContext,
  baseUrl: string,
  uid: string
) {
  const secret = process.env.E2E_TEST_SECRET;
  if (!secret) throw new Error("Missing E2E_TEST_SECRET");

  const res = await request.post(`${baseUrl}/api/__test__/auth/id-token`, {
    headers: { "X-Test-Secret": secret },
    data: { uid },
  });

  if (!res.ok()) throw new Error(`Failed to mint token: ${res.status()}`);

  const { idToken } = await res.json();
  return api(request, baseUrl, idToken);
}
