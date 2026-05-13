import { test } from "../../../src/ui.fixtures";
import Project from "../../../src/models/Project";
import {
  seedSwipeScenario,
  SWIPE_SCENARIO_AREA,
} from "../../../src/apiHelper/swipeMatching/seedSwipeScenario";

test.describe("Top tradesperson badge on the swipe deck", () => {
  test("Homeowner can open the photo lightbox on a Top tradesperson's previous job", async ({
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

    const completedProject = await projectApi.createProject(
      Project.aProject()
        .withRandomDetails({
          locationQuery: SWIPE_SCENARIO_AREA,
          locationPick: SWIPE_SCENARIO_AREA,
        })
        .toApiPayload(),
    );
    await swipeMatchingApi.seedBoostedClosure({
      projectId: Number(completedProject.id),
      winnerTradesmanUid: builder.uid,
      photoPaths: ["/uploads/test-photo-1.jpg"],
    });

    await swipeDeckPage.visitForProject(projectId);
    await swipeDeckPage.hasRenderedDeck();

    await swipeDeckPage.hasBuilderCardDetails({
      company: builder.tradesman.companyName,
      tier: "recommended",
      topTradesperson: true,
    });

    await swipeDeckPage.flipCard();
    await swipeDeckPage.hasBuilderCardDetails({
      company: builder.tradesman.companyName,
      recentlyCompletedIn: SWIPE_SCENARIO_AREA,
    });

    await swipeDeckPage.tapRecentCompletedBand();
    await swipeDeckPage.showsLightbox();
  });

  test("Homeowner sees the Top tradesperson badge without a lightbox when the previous job has no photos", async ({
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

    const completedProject = await projectApi.createProject(
      Project.aProject()
        .withRandomDetails({
          locationQuery: SWIPE_SCENARIO_AREA,
          locationPick: SWIPE_SCENARIO_AREA,
        })
        .toApiPayload(),
    );
    await swipeMatchingApi.seedBoostedClosure({
      projectId: Number(completedProject.id),
      winnerTradesmanUid: builder.uid,
      // No photoPaths - boost consent without photos.
    });

    await swipeDeckPage.visitForProject(projectId);
    await swipeDeckPage.hasRenderedDeck();

    await swipeDeckPage.hasBuilderCardDetails({
      company: builder.tradesman.companyName,
      tier: "recommended",
      topTradesperson: true,
    });

    await swipeDeckPage.flipCard();
    await swipeDeckPage.hasBuilderCardDetails({
      company: builder.tradesman.companyName,
      recentlyCompletedIn: SWIPE_SCENARIO_AREA,
    });
    await swipeDeckPage.recentCompletedBandIsStatic();

    await swipeDeckPage.tapRecentCompletedBand();
    await swipeDeckPage.lightboxIsClosed();
  });
});
