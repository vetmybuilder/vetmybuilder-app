// e2e-tests/src/apiHelper/tradesman/setupTradesmanJobsListScene.ts
//
// Test scaffold for the /tradesman/jobs/list browse view. Seeds:
//   1. The calling tradesman with deterministic trade_types + areas so
//      the scoring/filter outcomes are predictable.
//   2. Three live homeowner-owned projects with three different work
//      types + locations engineered to land at known aiScore tiers
//      (jobMatcher.scoreMatch: trade fuzzy match + outward area + recency):
//        - High row    : workType = matchingTrade,  area same as builder
//                        -> trade 30 + area 30 + recency 10 = 70 (>= 60, NOT dimmed)
//        - Medium row  : workType = unrelatedTrade, area same first letter
//                        -> trade 0  + area 15 + recency 10 = 25 (< 60, dimmed)
//        - Low row     : workType = unrelatedTrade, area different first letter
//                        -> trade 0  + area 0  + recency 10 = 10 (< 60, dimmed)
//
// Only the High row's workType matches the tradesman's trade_types
// exactly, so it's the only row visible under the "My trades" chip.
//
// Returns the project ids + the tradesman so the spec can assert
// against specific rows.

import type { APIRequestContext } from "@playwright/test";
import { authedApiForUid } from "../../api/services/client";
import { AuthApi } from "../auth/AuthApi";
import { createAuthUser } from "../../helpers/FirebaseSeed";
import Account from "../../models/Account";
import Project from "../../models/Project";
import ProjectApi from "../project/ProjectApi";
import Tradesman from "../../models/tradesman";
import type AdminApi from "../admin/AdminApi";

type TradesmanClient = {
  put: (
    path: string,
    payload?: any,
  ) => Promise<{ status(): number; text(): Promise<string> }>;
  getTradesmanUserId: () => Promise<string>;
};

type SetupArgs = {
  request: APIRequestContext;
  apiBaseUrl: string;
  tradesmanClient: TradesmanClient;
  adminApi: AdminApi;
};

export type JobsListScene = {
  tradesmanUid: string;
  matchingTrade: string;
  /** Score >= 60, in builder area, type matches My trades chip. */
  highScoreProjectId: number;
  /** Score < 60, same area letter, type does NOT match My trades. */
  mediumScoreProjectId: number;
  /** Score < 60, different area letter, type does NOT match My trades. */
  lowScoreProjectId: number;
};

const PRIMARY_AREA = "E4";
const NEIGHBOUR_AREA = "E5"; // same first letter -> partial location score
const FAR_AREA = "N1"; // different first letter -> 0 location score

async function seedProject(
  request: APIRequestContext,
  apiBaseUrl: string,
  workType: string,
  location: string,
): Promise<number> {
  const password = "Passw0rd!";
  const owner = Account.anAccount()
    .withRandomDetails()
    .withLocation(location)
    .withEmail(
      `owner+${Date.now()}-${Math.random().toString(16).slice(2, 6)}@test.com`,
    )
    .withPassword(password);

  const ownerAuthUser = await createAuthUser(owner.email!, owner.password!);
  const ownerClient = await authedApiForUid(
    request,
    apiBaseUrl,
    ownerAuthUser.uid,
  );
  await AuthApi.signup(ownerClient, owner);

  const ownerProjectApi = new ProjectApi(ownerClient);
  const project = Project.aProject().withRandomDetails({
    workTypes: [workType],
    locationQuery: location,
    locationPick: location,
  });

  const created = await ownerProjectApi.createProject(project.toApiPayload());
  await ownerProjectApi.publishProject(created.id);
  return created.id;
}

export async function setupTradesmanJobsListScene(
  args: SetupArgs,
): Promise<JobsListScene> {
  const matchingTrade = "Plumber";
  const unrelatedTrade = "Roofer";

  const tradesman = Tradesman.aTradesman()
    .withRandomDetails()
    .withTradeTypes(matchingTrade)
    .withServiceAreas(PRIMARY_AREA);

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

  const highScoreProjectId = await seedProject(
    args.request,
    args.apiBaseUrl,
    matchingTrade,
    PRIMARY_AREA,
  );
  const mediumScoreProjectId = await seedProject(
    args.request,
    args.apiBaseUrl,
    unrelatedTrade,
    NEIGHBOUR_AREA,
  );
  const lowScoreProjectId = await seedProject(
    args.request,
    args.apiBaseUrl,
    unrelatedTrade,
    FAR_AREA,
  );

  return {
    tradesmanUid,
    matchingTrade,
    highScoreProjectId,
    mediumScoreProjectId,
    lowScoreProjectId,
  };
}
