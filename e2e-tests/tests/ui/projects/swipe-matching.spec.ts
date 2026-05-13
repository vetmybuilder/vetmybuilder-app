import { test } from "../../../src/ui.fixtures";
import {
  seedSwipeScenario,
  SWIPE_SCENARIO_COMPANY,
} from "../../../src/apiHelper/swipeMatching/seedSwipeScenario";

test.describe("Homeowner and tradesperson matching", () => {
  test.beforeEach(() => {
    test.setTimeout(120_000);
  });

  test("Homeowner and tradesperson form a match", async ({
    request,
    runtime,
    apiClient,
    projectApi,
    swipeMatchingApi,
    swipeDeckPage,
    matchPage,
  }) => {
    const { projectId, builder } = await seedSwipeScenario({
      request,
      apiBaseUrl: runtime.apiBaseUrl,
      projectApi,
      swipeMatchingApi,
    });

    await swipeDeckPage.visitForProject(projectId);
    await swipeDeckPage.hasRenderedDeck();
    await swipeDeckPage.tapLike();

    const interest = await swipeMatchingApi.waitForSwipeInterest({
      projectId,
      builderUid: builder.uid,
      expectedStatus: "pending",
    });

    await swipeMatchingApi.builderAcceptsMatch(
      builder.tradesmanClient,
      interest.id,
    );

    await swipeMatchingApi.hasMatchContactFor(apiClient, interest.id, {
      builderNameContains: SWIPE_SCENARIO_COMPANY.split(" ")[0],
      emailContains: "tm-",
    });

    await matchPage.visit(interest.id);
    await matchPage.hasCelebrationHeading();
    await matchPage.showsBuilderName(SWIPE_SCENARIO_COMPANY);
    await matchPage.showsEmailCta();
    await matchPage.showsCallCta();
  });

  test("Tradesperson declines a homeowner's interest", async ({
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
    await swipeDeckPage.tapLike();

    const interest = await swipeMatchingApi.waitForSwipeInterest({
      projectId,
      builderUid: builder.uid,
      expectedStatus: "pending",
    });

    await swipeMatchingApi.builderDeclinesMatch(
      builder.tradesmanClient,
      interest.id,
    );

    await swipeMatchingApi.waitForSwipeInterest({
      projectId,
      builderUid: builder.uid,
      expectedStatus: "declined_by_builder",
    });
  });

  test("Homeowner passes on a tradesperson", async ({
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
    await swipeDeckPage.tapPass();

    await swipeMatchingApi.waitForSwipeInterest({
      projectId,
      builderUid: builder.uid,
      expectedStatus: "declined_by_homeowner",
    });
  });
});
