// e2e-tests/src/apiHelper/tradesman/setupTradesmanProfile.ts
//
// Test scaffold: creates a Firebase-authed API client for a tradesman user and
// seeds their tradesmen row via PUT /api/tradesmen/me. Used by API tests that
// need a real tradesman to exist (e.g. hire flow tests) but don't care about
// any UI session for them.

import type { APIRequestContext } from "@playwright/test";
import { authedApiForUid } from "../../api/services/client";
import Tradesman from "../../models/tradesman";
import HireApi from "../project/HireApi";
import NotificationsApi from "../NotificationsApi";

type SetupArgs = {
  request: APIRequestContext;
  apiBaseUrl: string;
  /** Provide if the test needs a specific uid; otherwise one is generated. */
  uid?: string;
  /** Pre-built tradesman model. Defaults to `.withRandomDetails()`. */
  tradesman?: Tradesman;
};

type SetupResult = {
  uid: string;
  tradesmanClient: Awaited<ReturnType<typeof authedApiForUid>>;
  tradesman: Tradesman;
  /**
   * HireApi pre-bound to the tradesman's authenticated client. Use this in
   * tests instead of constructing HireApi manually so tests stay declarative.
   */
  tradesmanHireApi: HireApi;
  /**
   * NotificationsApi pre-bound to the tradesman's authenticated client.
   * Used by tests that verify notifications delivered to the tradesman.
   */
  tradesmanNotificationsApi: NotificationsApi;
};

export async function setupTradesmanProfile(
  args: SetupArgs,
): Promise<SetupResult> {
  const uid =
    args.uid ??
    `tm-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`;

  const tradesmanClient = await authedApiForUid(
    args.request,
    args.apiBaseUrl,
    uid,
  );

  const tradesman = args.tradesman ?? Tradesman.aTradesman().withRandomDetails();

  const res = await tradesmanClient.put(
    "/api/tradesmen/me",
    tradesman.toPayload(),
  );
  if (res.status() !== 200) {
    const body = await res.text().catch(() => "");
    throw new Error(`Failed to seed tradesman: ${res.status()}\n${body}`);
  }

  return {
    uid,
    tradesmanClient,
    tradesman,
    tradesmanHireApi: new HireApi(tradesmanClient),
    tradesmanNotificationsApi: new NotificationsApi(tradesmanClient),
  };
}
