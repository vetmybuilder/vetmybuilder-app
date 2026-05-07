import type { APIRequestContext } from "@playwright/test";
import Project from "../../models/Project";
import Tradesman from "../../models/tradesman";
import { setupTradesmanProfile } from "../tradesman/setupTradesmanProfile";
import type { ProjectApi } from "../project/ProjectApi";
import type SwipeMatchingApi from "./SwipeMatchingApi";

export const SWIPE_SCENARIO_COMPANY = "Swipe Smoke Builders Ltd";
export const SWIPE_SCENARIO_AREA = "E4";
// Must match a canonical TRADE_TYPES.label (web/types/tradeTypes.ts).
// "Plumber" is in the canonical-trades list for the default project
// type ("Tumble Dryer Installation" → Appliances category). Lowercase
// "plumbing" was the legacy seed value but matches nothing in the
// canonical map, so the homeowner's deck would render empty.
export const SWIPE_SCENARIO_TRADE = "Plumber";

type SeedArgs = {
  request: APIRequestContext;
  apiBaseUrl: string;
  projectApi: ProjectApi;
  swipeMatchingApi: SwipeMatchingApi;
};

export type SwipeScenario = {
  projectId: number;
  builder: Awaited<ReturnType<typeof setupTradesmanProfile>>;
};

export async function seedSwipeScenario(args: SeedArgs): Promise<SwipeScenario> {
  const created = await args.projectApi.createProject(
    Project.aProject().withRandomDetails().toApiPayload(),
  );

  const builder = await setupTradesmanProfile({
    request: args.request,
    apiBaseUrl: args.apiBaseUrl,
    tradesman: Tradesman.aTradesman()
      .withRandomDetails()
      .withCompanyName(SWIPE_SCENARIO_COMPANY)
      .withServiceAreas(SWIPE_SCENARIO_AREA)
      .withTradeTypes(SWIPE_SCENARIO_TRADE),
  });

  const projectId = Number(created.id);
  await args.swipeMatchingApi.linkTradesmanToProject({
    projectId,
    tradesmanUid: builder.uid,
    company: builder.tradesman.companyName,
  });
  await args.swipeMatchingApi.classifyProject({
    projectId,
    recommendedTrades: [SWIPE_SCENARIO_TRADE],
  });

  return { projectId, builder };
}
