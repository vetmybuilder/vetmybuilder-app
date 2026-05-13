import { test } from "../../../src/ui.fixtures";
import Project from "../../../src/models/Project";
import Tradesman from "../../../src/models/tradesman";
import { setupTradesmanProfile } from "../../../src/apiHelper/tradesman/setupTradesmanProfile";
import {
  SWIPE_SCENARIO_AREA,
  SWIPE_SCENARIO_TRADE,
} from "../../../src/apiHelper/swipeMatching/seedSwipeScenario";

test.describe("Homeowner sees tradespeople on the swipe deck", () => {
  test("Homeowner sees a recommended tradesperson", async ({
    request,
    runtime,
    projectApi,
    swipeMatchingApi,
    swipeDeckPage,
  }) => {
    const project = await projectApi.createProject(
      Project.aProject()
        .withRandomDetails({
          locationQuery: SWIPE_SCENARIO_AREA,
          locationPick: SWIPE_SCENARIO_AREA,
        })
        .toApiPayload(),
    );

    const company = `Harrow Building Co ${Date.now()}`;
    const builder = await setupTradesmanProfile({
      request,
      apiBaseUrl: runtime.apiBaseUrl,
      tradesman: Tradesman.aTradesman()
        .withRandomDetails()
        .withCompanyName(company)
        .withServiceAreas(SWIPE_SCENARIO_AREA)
        .withTradeTypes(SWIPE_SCENARIO_TRADE),
    });

    await swipeMatchingApi.seedTradesmanStats({
      tradesmanUid: builder.uid,
      googleRating: 4.8,
      googleReviewsCount: 27,
      chStatus: "verified",
      yearsTrading: 12,
    });

    await swipeMatchingApi.linkTradesmanToProject({
      projectId: Number(project.id),
      tradesmanUid: builder.uid,
      recommenderFirstName: "Alex",
      company,
    });

    await swipeDeckPage.visitForProject(project.id);
    await swipeDeckPage.hasRenderedDeck();

    await swipeDeckPage.hasBuilderCardDetails({
      company,
      rating: 4.8,
      reviewCount: 27,
      yearsTrading: 12,
      verified: true,
      tier: "recommended",
      recommenderName: "Alex",
    });
  });

  test("Homeowner sees an AI-matched tradesperson", async ({
    request,
    runtime,
    projectApi,
    swipeDeckPage,
  }) => {
    const project = await projectApi.createProject(
      Project.aProject()
        .withRandomDetails({
          locationQuery: SWIPE_SCENARIO_AREA,
          locationPick: SWIPE_SCENARIO_AREA,
        })
        .toApiPayload(),
    );

    const company = `AI Matched Co ${Date.now()}`;
    await setupTradesmanProfile({
      request,
      apiBaseUrl: runtime.apiBaseUrl,
      tradesman: Tradesman.aTradesman()
        .withRandomDetails()
        .withCompanyName(company)
        .withServiceAreas(SWIPE_SCENARIO_AREA)
        .withTradeTypes(SWIPE_SCENARIO_TRADE),
    });

    await swipeDeckPage.visitForProject(project.id);
    await swipeDeckPage.hasRenderedDeck();

    await swipeDeckPage.hasBuilderCardDetails({
      company,
      tier: "ai-matched",
    });
  });
});
