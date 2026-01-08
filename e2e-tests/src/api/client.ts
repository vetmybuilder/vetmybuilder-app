import type { APIRequestContext } from "@playwright/test";

export function api(
  request: APIRequestContext,
  baseUrl: string,
  bearerToken?: string
) {
  const headers = bearerToken
    ? { Authorization: `Bearer ${bearerToken}` }
    : undefined;

  return {
    get: (path: string) => request.get(baseUrl + path, { headers }),
    post: (path: string, data?: any) =>
      request.post(baseUrl + path, { data, headers }),
    put: (path: string, data?: any) =>
      request.put(baseUrl + path, { data, headers }),
    del: (path: string) => request.delete(baseUrl + path, { headers }),
  };
}

export async function authedApiForUid(
  request: APIRequestContext,
  baseUrl: string,
  uid: string
) {
  const secret = process.env.E2E_TEST_SECRET;
  if (!secret) {
    throw new Error("Missing E2E_TEST_SECRET");
  }

  const res = await request.post(`${baseUrl}/api/__test__/auth/id-token`, {
    headers: { "X-Test-Secret": secret },
    data: { uid },
  });

  if (!res.ok()) {
    throw new Error(`Failed to mint token: ${res.status()}`);
  }

  const { idToken } = await res.json();

  return api(request, baseUrl, idToken);
}
