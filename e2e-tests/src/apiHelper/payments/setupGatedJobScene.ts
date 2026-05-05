// e2e-tests/src/apiHelper/payments/setupGatedJobScene.ts
//
// Test scaffold for the SwipePayGate UI flow on /tradesman/jobs.
//
// What it does:
//   1. Seeds the calling tradesman's profile via PUT /api/tradesmen/me.
//   2. Activates them through the admin endpoint so the job-deck routes
//      (which require an active tradesman) accept their requests.
//   3. Creates a fresh homeowner + live project the tradesman has never
//      seen, so the project surfaces in their deck.
//   4. Optionally links the tradesman to the project as a "recommended"
//      candidate - which makes that swipe free (skips the pay-gate).
//
// Returns enough information for the UI test to assert the right job is
// on top of the deck and the gate (or its absence) shows the right copy.

import type { APIRequestContext } from "@playwright/test";
import type AdminApi from "../admin/AdminApi";
import type SwipeMatchingApi from "../swipeMatching/SwipeMatchingApi";
import { setupOwnerWithLiveProject } from "../project/setupOwnerWithLiveProject";
import Tradesman from "../../models/tradesman";

type TradesmanClient = {
  put: (path: string, payload?: any) => Promise<{ status(): number; text(): Promise<string> }>;
  getTradesmanUserId: () => Promise<string>;
};

type SetupArgs = {
  request: APIRequestContext;
  apiBaseUrl: string;
  /** Authed client for the tradesman - typically the worker's apiClient. */
  tradesmanClient: TradesmanClient;
  /** Defaults to a random in-area tradesman. */
  tradesman?: Tradesman;
  adminApi: AdminApi;
  /** When provided, also seeds a recommendation linking the tradesman to
   *  the project so the swipe is free (no pay-gate). */
  recommendVia?: SwipeMatchingApi;
};

type SetupResult = {
  projectId: number;
  projectTitle: string;
  tradesmanUid: string;
  tradesman: Tradesman;
};

export async function setupGatedJobScene(args: SetupArgs): Promise<SetupResult> {
  const tradesman =
    args.tradesman ?? Tradesman.aTradesman().withRandomDetails();

  const seedRes = await args.tradesmanClient.put(
    "/api/tradesmen/me",
    tradesman.toPayload(),
  );
  if (seedRes.status() !== 200) {
    const body = await seedRes.text().catch(() => "");
    throw new Error(`Failed to seed tradesman: ${seedRes.status()}\n${body}`);
  }

  const tradesmanUid = await args.tradesmanClient.getTradesmanUserId();
  await args.adminApi.setTradesmanStatus(tradesmanUid, "active");

  const owner = await setupOwnerWithLiveProject({
    request: args.request,
    apiBaseUrl: args.apiBaseUrl,
  });

  const projectTitle = owner.project.toApiPayload().name;

  if (args.recommendVia) {
    await args.recommendVia.linkTradesmanToProject({
      projectId: owner.projectId,
      tradesmanUid,
      company: tradesman.companyName,
    });
  }

  return {
    projectId: owner.projectId,
    projectTitle,
    tradesmanUid,
    tradesman,
  };
}
