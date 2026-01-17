import type { APIRequestContext, Page } from "@playwright/test";
import { createApiCore } from "../_core";
import { projectsClient } from "../services/projects.client";
import { recommendationsClient } from "../services/recommendations.client";
import { tradesmenClient } from "../services/tradesmen.client";

export function api(
  request: APIRequestContext,
  baseUrl: string,
  bearerToken?: string,
  page?: Page,
) {
  const core = createApiCore({ request, baseUrl, bearerToken, page });

  return {
    // core http + shared helpers
    get: core.get,
    post: core.post,
    put: core.put,
    del: core.del,
    getJson: core.getJson,
    waitForAccount: core.waitForAccount,
    postMultipart: core.postMultipart,
    postMultipartViaBrowser: core.postMultipartViaBrowser,

    // services
    ...projectsClient(core),
    ...recommendationsClient(core),
    ...tradesmenClient(core),
  };
}

export async function authedApiForUid(
  request: APIRequestContext,
  baseUrl: string,
  uid: string,
  page?: Page,
) {
  if (baseUrl.includes(":3000")) {
    throw new Error(
      `INVALID baseUrl passed to authedApiForUid: ${baseUrl} Use Playwright project baseURL (3100+) instead`,
    );
  }

  const secret = process.env.E2E_TEST_SECRET;
  if (!secret) throw new Error("Missing E2E_TEST_SECRET");

  const res = await request.post(`${baseUrl}/api/__test__/auth/id-token`, {
    headers: { "X-Test-Secret": secret },
    data: { uid },
  });

  if (!res.ok()) throw new Error(`Failed to mint token: ${res.status()}`);

  const { idToken } = await res.json();
  return api(request, baseUrl, idToken, page);
}

export async function getUidFromJoinResponse(res: { json(): Promise<any> }) {
  const body: any = await res.json();

  const uid =
    body?.uid || body?.userId || body?.id || body?.data?.uid || body?.data?.id;

  if (!uid)
    throw new Error("Could not find uid in /api/tradesmen/join response");

  return String(uid);
}
