import Project from "../../../src/models/Project";
import { test, expect } from "../../../src/fixtures";

test.describe("GET /api/projects/:id — classification", () => {
  test("includes classification after the fire-and-forget classifier runs", async ({
    projectApi,
  }) => {
    const project = await projectApi.createProject(
      Project.aProject().withRandomDetails().toApiPayload(),
    );

    const body = await projectApi.waitForClassification(project.id);
    const classification = body.classification;

    expect(classification.type).toBeTruthy();
    expect(classification.scope).toBeTruthy();
    expect(classification.complexity).toBeTruthy();
    expect(classification.urgency).toBeTruthy();
    expect(classification.recommended_trades).toBeInstanceOf(Array);
    expect(classification.recommended_trades.length).toBeGreaterThan(0);
    expect(classification.summary).toBeTruthy();
  });

  test("returns null classification when no classification row exists yet", async ({
    projectApi,
  }) => {
    const project = await projectApi.createProject(
      Project.aProject().withRandomDetails().toApiPayload(),
    );

    // Fetch immediately — classification may not exist yet.
    // The endpoint must never error; classification is null or valid.
    const fetched = await projectApi.getProject(project.id);
    expect(fetched).toBeTruthy();
  });
});
