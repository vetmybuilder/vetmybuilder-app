import type { APIRequestContext, Page } from "@playwright/test";
import { authedApiForUid } from "../../api/services/client";
import { uiLoginAsUid } from "../uiAuth";
import Tradesman from "../../models/tradesman";

/**
 * Provision a brand-new tradesman, sign them in, return the uid.
 *
 * Three steps, in order:
 *   1. Mint a Firebase token for a fresh uid (authedApiForUid).
 *   2. PUT /api/tradesmen/me to seed the profile row in MySQL.
 *   3. Establish the UI session (uiLoginAsUid).
 *
 * Returns the generated uid so tests can correlate with API state. Does
 * NOT navigate the page anywhere - the test that needs a specific
 * post-login screen should goto + wait itself. (Historically a warmup
 * goto to /tradesman/profile/edit lived here as a band-aid for a mobile
 * webkit auth-state race; removed in favour of explicit per-test waits.)
 */
export async function signInAsNewTradesman(args: {
  request: APIRequestContext;
  page: Page;
  apiBaseUrl: string;
  uiBaseUrl: string;
  tradesman: Tradesman;
  uid?: string;
}): Promise<string> {
  const uid =
    args.uid ??
    `e2e-pp-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`;

  const client = await authedApiForUid(
    args.page.request,
    args.apiBaseUrl,
    uid,
    args.page,
  );

  const res = await client.put("/api/tradesmen/me", args.tradesman.toPayload());
  if (res.status() !== 200) {
    const body = await res.text().catch(() => "");
    throw new Error(`Failed to seed tradesman: ${res.status()}\n${body}`);
  }

  await uiLoginAsUid({
    request: args.request,
    page: args.page,
    apiBaseUrl: args.apiBaseUrl,
    uiBaseUrl: args.uiBaseUrl,
    uid,
  });

  return uid;
}
