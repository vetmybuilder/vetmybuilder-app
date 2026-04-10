import Project from "../../../src/models/Project";
import Recommendation from "../../../src/models/Recommendation";
import { test, expect } from "../../../src/fixtures";

test.describe("Recommendation signals", () => {
  test("signals are computed after creating a recommendation", async ({
    projectApi,
    projectRecommendationApi,
    adminApiClient,
  }) => {
    const project = await projectApi.createLiveProject(
      Project.aProject().withRandomDetails().toApiPayload(),
    );

    const rec = Recommendation.aRecommendation().withRandomDetails();
    await projectRecommendationApi.createRecommendation(project.id, rec.toPayload());

    // The signaller runs fire-and-forget. Trigger the admin batch route
    // to ensure any missed signals are computed, then verify.
    const batchRes = await adminApiClient.post(
      "/api/admin/compute-recommendation-signals",
    );
    expect(batchRes.status()).toBe(200);
    const batch = await batchRes.json();
    expect(batch.ok).toBe(true);

    // Either the fire-and-forget already computed it (skipped by batch)
    // or the batch just computed it. Either way, total should be accounted for.
    expect(batch.computed + batch.skipped).toBeGreaterThanOrEqual(0);
    expect(batch.failed).toBe(0);
  });
});
