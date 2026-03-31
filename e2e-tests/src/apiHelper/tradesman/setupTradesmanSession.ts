import type { APIRequestContext, Page } from "@playwright/test";
import { authedApiForUid } from "../../api/services/client";
import { uiLoginAsUid } from "../uiAuth";
import Tradesman from "../../models/tradesman";

export async function loginInAsTradesman(args: {
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

  // Navigate to the edit page and wait for it to be ready — this confirms the
  // Firebase auth state is fully established before the test proceeds.
  // Without this, mobile webkit sometimes fails to load the protected edit page
  // on the first navigation after uiLoginAsUid → about:blank.
  await args.page.goto(`${args.uiBaseUrl}/tradesman/profile/edit`, {
    waitUntil: "domcontentloaded",
  });
  await args.page
    .waitForSelector('[data-testid="trades-edit-profile-page"]', {
      timeout: 20_000,
    })
    .catch(() => {});

  return uid;
}
