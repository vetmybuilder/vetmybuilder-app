import { test } from "../../../src/ui.fixtures";
import Project from "../../../src/models/Project";
import {
  seedSwipeScenario,
  SWIPE_SCENARIO_AREA,
} from "../../../src/apiHelper/swipeMatching/seedSwipeScenario";

test.describe("Top tradesperson surfaces on the homeowner deck", () => {
  test("builder with a boosted closure that has photos: front shows Top tradesperson chip, back shows Recently completed band, tapping the band opens the photo lightbox", async ({
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
    await swipeDeckPage.showsTopTradespersonChip();

    await swipeDeckPage.flipCard();
    await swipeDeckPage.showsRecentCompletedBandFor(SWIPE_SCENARIO_AREA);

    await swipeDeckPage.tapRecentCompletedBand();
    await swipeDeckPage.showsLightbox();
  });

  test("builder with a boosted closure but no photos: front shows Top tradesperson chip, back shows Recently completed band as a static (non-clickable) div, tapping the band does not open the photo lightbox", async ({
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
    await swipeDeckPage.showsTopTradespersonChip();

    await swipeDeckPage.flipCard();
    await swipeDeckPage.showsRecentCompletedBandFor(SWIPE_SCENARIO_AREA);
    await swipeDeckPage.recentCompletedBandIsStatic();

    await swipeDeckPage.tapRecentCompletedBand();
    await swipeDeckPage.lightboxIsClosed();
  });
});
