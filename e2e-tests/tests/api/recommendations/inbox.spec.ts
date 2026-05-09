import Project from "../../../src/models/Project";
import Recommendation from "../../../src/models/Recommendation";
import { test, expect } from "../../../src/fixtures";

test.describe("GET /api/recommendations/inbox", () => {
  test("returns the homeowner's recommendations (regression: route order vs /:id)", async ({
    apiClient,
    projectApi,
    projectRecommendationApi,
  }) => {
    const project = await projectApi.createLiveProject(
      Project.aProject().withRandomDetails().toApiPayload(),
    );

    const rec = Recommendation.aRecommendation().withRandomDetails();
    await projectRecommendationApi.createRecommendation(
      project.id,
      rec.toPayload(),
    );

    const res = await apiClient.get("/api/recommendations/inbox");

    // Guard against the route-shadowing bug where /recommendations/:id
    // matched first and returned 400 "Invalid id" because Number("inbox") is NaN.
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.items.length).toBeGreaterThanOrEqual(1);
    expect(body.items[0]).toMatchObject({
      kind: "recommendation",
      projectId: project.id,
    });
  });
});
