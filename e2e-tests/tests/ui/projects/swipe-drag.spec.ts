import { test } from "../../../src/ui.fixtures";
import Tradesman from "../../../src/models/tradesman";
import { setupTradesmanProfile } from "../../../src/apiHelper/tradesman/setupTradesmanProfile";
import {
  seedSwipeScenario,
  SWIPE_SCENARIO_AREA,
  SWIPE_SCENARIO_TRADE,
} from "../../../src/apiHelper/swipeMatching/seedSwipeScenario";

test.describe("Homeowner swipes on the deck", () => {
  test("Homeowner swipes right to like a tradesperson", async ({
    request,
    runtime,
    projectApi,
    swipeMatchingApi,
    swipeDeckPage,
  }) => {
    const { projectId, builder } = await seedSwipeScenario({
      request,
      apiBaseUrl: runtime.apiBaseUrl,
      projectApi,
      swipeMatchingApi,
    });

    await swipeDeckPage.visitForProject(projectId);
    await swipeDeckPage.hasRenderedDeck();

    await swipeDeckPage.dragTopCardRight();

    await swipeMatchingApi.waitForSwipeInterest({
      projectId,
      builderUid: builder.uid,
      expectedStatus: "pending",
    });
  });

  test("Homeowner swipes left to pass on a tradesperson", async ({
    request,
    runtime,
    projectApi,
    swipeMatchingApi,
    swipeDeckPage,
  }) => {
    const { projectId, builder } = await seedSwipeScenario({
      request,
      apiBaseUrl: runtime.apiBaseUrl,
      projectApi,
      swipeMatchingApi,
    });

    await swipeDeckPage.visitForProject(projectId);
    await swipeDeckPage.hasRenderedDeck();

    await swipeDeckPage.dragTopCardLeft();

    await swipeMatchingApi.waitForSwipeInterest({
      projectId,
      builderUid: builder.uid,
      expectedStatus: "declined_by_homeowner",
    });
  });

  test("Swiping the top card promotes the next tradesperson to the top of the deck", async ({
    request,
    runtime,
    projectApi,
    swipeMatchingApi,
    swipeDeckPage,
  }) => {
    const { projectId, builder: builderA } = await seedSwipeScenario({
      request,
      apiBaseUrl: runtime.apiBaseUrl,
      projectApi,
      swipeMatchingApi,
    });

    const builderB = await setupTradesmanProfile({
      request,
      apiBaseUrl: runtime.apiBaseUrl,
      tradesman: Tradesman.aTradesman()
        .withRandomDetails()
        .withCompanyName(`Second Recommended Co ${Date.now()}`)
        .withServiceAreas(SWIPE_SCENARIO_AREA)
        .withTradeTypes(SWIPE_SCENARIO_TRADE),
    });
    await swipeMatchingApi.linkTradesmanToProject({
      projectId,
      tradesmanUid: builderB.uid,
      company: builderB.tradesman.companyName,
    });

    await swipeDeckPage.visitForProject(projectId);
    await swipeDeckPage.hasRenderedDeck();

    const firstCompany = await swipeDeckPage.readTopCardCompany();
    const nextCompany =
      firstCompany === builderA.tradesman.companyName
        ? builderB.tradesman.companyName
        : builderA.tradesman.companyName;

    await swipeDeckPage.dragTopCardRight();
    await swipeDeckPage.hasBuilderCardDetails({ company: nextCompany });
  });
});
