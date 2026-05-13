// e2e-tests/src/apiHelper/swipeMatching/setupIncomingLead.ts
//
// Test scaffold for the /tradesman/leads card. Produces the end-state
// the tradesperson sees when a homeowner has picked them but they
// haven't responded yet:
//
//   - A new homeowner with a live project in the requested outward area
//   - The tradesperson linked to the project via a recommendation row
//   - A swipe_interest row at status='pending' where only the
//     homeowner_swiped_at timestamp is set (builder_swiped_at = NULL)
//
// All three steps go through __test__ endpoints so the test doesn't
// have to drive the real recommendation matcher or the swipe-deck UI
// as the homeowner before testing the tradesman's view.

import type { APIRequestContext } from "@playwright/test";
import { setupOwnerWithLiveProject } from "../project/setupOwnerWithLiveProject";
import type SwipeMatchingApi from "./SwipeMatchingApi";

type Args = {
  request: APIRequestContext;
  apiBaseUrl: string;
  swipeMatchingApi: SwipeMatchingApi;
  /** UID of the tradesperson the homeowner is "picking". */
  tradesmanUid: string;
  /** Company name on the recommendation row + lead card. */
  tradesmanCompany: string;
  /** Defaults to "E4". Outward shown on the lead card. */
  location?: string;
  /**
   * Which bucket the homeowner saw the trade in. 'recommended' seeds a
   * recommendation row linking the trade to the project; 'subscribed'
   * skips that, mirroring a discovery-deck-driven pick.
   */
  source?: "recommended" | "subscribed";
};

export type IncomingLeadScenario = {
  projectId: number;
  projectTitle: string;
  matchId: number;
  homeownerUid: string;
  homeownerFirstName: string;
  outward: string;
};

export async function setupIncomingLead(
  args: Args,
): Promise<IncomingLeadScenario> {
  const location = args.location ?? "E4";
  const source = args.source ?? "recommended";

  const owner = await setupOwnerWithLiveProject({
    request: args.request,
    apiBaseUrl: args.apiBaseUrl,
    location,
  });

  if (source === "recommended") {
    await args.swipeMatchingApi.linkTradesmanToProject({
      projectId: owner.projectId,
      tradesmanUid: args.tradesmanUid,
      recommenderUid: owner.ownerUid,
      company: args.tradesmanCompany,
    });
  }

  const matchId = await args.swipeMatchingApi.seedHomeownerPendingSwipe({
    projectId: owner.projectId,
    homeownerUid: owner.ownerUid,
    builderUid: args.tradesmanUid,
    source,
  });

  return {
    projectId: owner.projectId,
    projectTitle: owner.project.toApiPayload().name,
    matchId,
    homeownerUid: owner.ownerUid,
    homeownerFirstName: owner.owner.firstName ?? "",
    outward: location,
  };
}
