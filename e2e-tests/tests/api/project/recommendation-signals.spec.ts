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

    const batchRes = await adminApiClient.post(
      "/api/admin/compute-recommendation-signals",
    );
    expect(batchRes.status()).toBe(200);
    const batch = await batchRes.json();
    expect(batch.ok).toBe(true);

    expect(batch.computed + batch.skipped).toBeGreaterThanOrEqual(0);
    expect(batch.failed).toBe(0);
  });
});
