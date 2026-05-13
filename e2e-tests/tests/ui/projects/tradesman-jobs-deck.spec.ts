import { test } from "../../../src/ui.fixtures";
import Tradesman from "../../../src/models/tradesman";
import { setupGatedJobScene } from "../../../src/apiHelper/payments/setupGatedJobScene";

test.describe("Tradesperson sees jobs on the swipe deck", () => {
  test("Tradesperson sees a job's details on the swipe deck", async ({
    request,
    runtime,
    apiClient,
    adminApi,
    swipeMatchingApi,
    tradesmanJobsDeckPage,
  }) => {
    const tradesman = Tradesman.aTradesman()
      .withRandomDetails()
      .withTradeTypes("Plumbing, Tumble Dryer Installation")
      .withServiceAreas("E4");

    const scene = await setupGatedJobScene({
      request,
      apiBaseUrl: runtime.apiBaseUrl,
      tradesmanClient: apiClient,
      adminApi,
      tradesman,
      // Seed a recommendation linking the tradesperson so the swipe is
      // free (no pay-gate complicating the surface check).
      recommendVia: swipeMatchingApi,
    });

    await swipeMatchingApi.classifyProject({
      projectId: scene.projectId,
      recommendedTrades: ["Plumber"],
      aiSummary:
        "Homeowner needs a tumble dryer installed in the utility room.",
      keyConcerns: ["minimise disruption", "watertight finish"],
    });

    await tradesmanJobsDeckPage.goto();

    await tradesmanJobsDeckPage.hasJobCardDetails({
      title: scene.projectTitle,
      type: "Tumble Dryer Installation",
      outward: "E4",
      aiSummary:
        "Homeowner needs a tumble dryer installed in the utility room.",
      aiMatchBadge: true,
      property: "4-bed Semi-Detached",
      postedLabel: true,
      keyConcerns: ["watertight finish"],
      matchedTrades: ["Tumble Dryer Installation"],
    });
  });
});
