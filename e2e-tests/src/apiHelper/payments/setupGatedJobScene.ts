// e2e-tests/src/apiHelper/payments/setupGatedJobScene.ts
//
// Test scaffold for the SwipePayGate UI flow on /tradesman/jobs.
//
// Returns once the backend state is ready for the UI:
//   - tradesman profile seeded + admin-activated
//   - homeowner + live project created (and optional recommendation seeded)
//   - the tradesman's deck endpoint actually returns the project
//
// The deck-endpoint poll at the end is what kills the previous
// flakiness: without it the spec could navigate to /tradesman/jobs
// before activation/publish had been observed, and the page silently
// rendered "No jobs posted yet" instead of the expected card.

import type { APIRequestContext } from "@playwright/test";
import type AdminApi from "../admin/AdminApi";
import type SwipeMatchingApi from "../swipeMatching/SwipeMatchingApi";
import { setupOwnerWithLiveProject } from "../project/setupOwnerWithLiveProject";
import Tradesman from "../../models/tradesman";

// The fixture's apiClient exposes `get`/`put` returning a Playwright
// APIResponse. We only need a narrow slice here.
type TradesmanClient = {
  get: (path: string) => Promise<{
    status(): number;
    text(): Promise<string>;
    json(): Promise<any>;
  }>;
  put: (
    path: string,
    payload?: any,
  ) => Promise<{ status(): number; text(): Promise<string> }>;
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

const DECK_READY_TIMEOUT_MS = 8_000;
const DECK_POLL_INTERVAL_MS = 250;

export async function setupGatedJobScene(args: SetupArgs): Promise<SetupResult> {
  const tradesman =
    args.tradesman ?? Tradesman.aTradesman().withRandomDetails();

  // 1. Seed the tradesman profile.
  const seedRes = await args.tradesmanClient.put(
    "/api/tradesmen/me",
    tradesman.toPayload(),
  );
  if (seedRes.status() !== 200) {
    const body = await seedRes.text().catch(() => "");
    throw new Error(`Failed to seed tradesman: ${seedRes.status()}\n${body}`);
  }

  // 2. Activate via admin so the deck route's requireActiveTradesman
  //    gate lets the calling tradesman through.
  const tradesmanUid = await args.tradesmanClient.getTradesmanUserId();
  await args.adminApi.setTradesmanStatus(tradesmanUid, "active");

  // 3. Fresh homeowner + live project.
  const owner = await setupOwnerWithLiveProject({
    request: args.request,
    apiBaseUrl: args.apiBaseUrl,
  });
  const projectTitle = owner.project.toApiPayload().name;

  // 4. Optional: seed the recommendation linking the tradesman to the
  //    project so the swipe is free (skips the pay-gate).
  if (args.recommendVia) {
    await args.recommendVia.linkTradesmanToProject({
      projectId: owner.projectId,
      tradesmanUid,
      company: tradesman.companyName,
    });
  }

  // 5. Wait for the tradesman's deck endpoint to actually surface the
  //    project. Without this, the test can race the admin activation
  //    or the project publish, and the page renders the empty state.
  await waitForDeckEntry({
    client: args.tradesmanClient,
    projectId: owner.projectId,
  });

  return {
    projectId: owner.projectId,
    projectTitle,
    tradesmanUid,
    tradesman,
  };
}

async function waitForDeckEntry(opts: {
  client: TradesmanClient;
  projectId: number;
}): Promise<void> {
  const start = Date.now();
  let lastStatus = 0;
  let lastTotalLive: number | undefined;
  let lastReturnedIds: number[] = [];

  while (Date.now() - start < DECK_READY_TIMEOUT_MS) {
    const res = await opts.client.get(
      "/api/tradesmen/jobs?mode=deck&limit=20",
    );
    lastStatus = res.status();

    if (lastStatus === 200) {
      const body = await res.json().catch(() => null);
      const items: Array<{ projectId?: number; id?: number }> =
        body?.items ?? body?.jobs ?? [];
      lastTotalLive = Number(body?.totalLive ?? 0);
      lastReturnedIds = items.map((it) => Number(it.projectId ?? it.id ?? 0));

      if (lastReturnedIds.includes(opts.projectId)) return;
    }

    await sleep(DECK_POLL_INTERVAL_MS);
  }

  throw new Error(
    `setupGatedJobScene: project ${opts.projectId} never appeared in the ` +
      `tradesman's deck within ${DECK_READY_TIMEOUT_MS}ms. ` +
      `lastStatus=${lastStatus}, totalLive=${lastTotalLive ?? "?"}, ` +
      `returnedIds=[${lastReturnedIds.join(", ")}]. ` +
      `Most likely the tradesman activation didn't take effect (403 from ` +
      `requireActiveTradesman) or the project publish didn't commit before the poll.`,
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
