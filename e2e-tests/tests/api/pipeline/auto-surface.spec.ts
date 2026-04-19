import { test, expect } from "../../../src/fixtures";
import Project from "../../../src/models/Project";

test.describe("Pipeline auto-surface on project publish", () => {
  test("pipeline recommendation with source=pipeline is returned by the recommendations API", async ({
    projectApi,
    pipelineApi,
    apiClient,
  }) => {
    // Create a project (no need to publish — we insert the rec directly)
    const project = Project.aProject().withRandomDetails({
      category: "Plumbing",
      workTypes: ["Bathroom Plumbing"],
      locationQuery: "E4",
      locationPick: "E4 0BQ",
    });
    const created = await projectApi.createProject(project.toApiPayload());

    // Insert a pipeline recommendation directly (simulates what auto-surface does)
    await pipelineApi.insertPipelineRecommendation(created.id, "E2E Pipeline Plumbing Ltd");

    // Verify the API returns it with source=pipeline
    const res = await apiClient.get(
      `/api/projects/${created.id}/recommendations?limit=50`,
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    const items = body.items ?? [];
    const rec = items.find(
      (r: any) => r.source === "pipeline" && r.company === "E2E Pipeline Plumbing Ltd",
    );
    expect(rec, "Pipeline rec should appear in recommendations API").toBeTruthy();
    expect(rec.comment).toContain("Vetted local business");
  });

  test("pending pipeline entry is not surfaced on publish", async ({
    projectApi,
    pipelineApi,
  }) => {
    await pipelineApi.insertEntry({
      companyName: "E2E Pending Plumber Ltd",
      tradeTypes: "plumber",
      serviceAreas: "E4",
      vettingScore: 80,
      status: "pending",
    });

    const project = Project.aProject().withRandomDetails({
      category: "Plumbing",
      workTypes: ["Bathroom Plumbing"],
      locationQuery: "E4",
      locationPick: "E4 0BQ",
    });
    const published = await projectApi.createProject(project.toApiPayload(), {
      publish: true,
    });

    await pipelineApi.expectNoPipelineRecsInDb(published.id);
  });

  test("pipeline entry in a different area is not surfaced", async ({
    projectApi,
    pipelineApi,
  }) => {
    await pipelineApi.insertEntry({
      companyName: "E2E Wrong Area Plumber Ltd",
      tradeTypes: "plumber",
      serviceAreas: "SW1",
      vettingScore: 80,
      status: "approved",
    });

    const project = Project.aProject().withRandomDetails({
      category: "Plumbing",
      workTypes: ["Bathroom Plumbing"],
      locationQuery: "E4",
      locationPick: "E4 0BQ",
    });
    const published = await projectApi.createProject(project.toApiPayload(), {
      publish: true,
    });

    await pipelineApi.expectNoPipelineRecsInDb(published.id);
  });

  test("pipeline entry below vetting score threshold is not surfaced", async ({
    projectApi,
    pipelineApi,
  }) => {
    await pipelineApi.insertEntry({
      companyName: "E2E Low Score Plumber Ltd",
      tradeTypes: "plumber",
      serviceAreas: "E4",
      vettingScore: 50,
      status: "approved",
    });

    const project = Project.aProject().withRandomDetails({
      category: "Plumbing",
      workTypes: ["Bathroom Plumbing"],
      locationQuery: "E4",
      locationPick: "E4 0BQ",
    });
    const published = await projectApi.createProject(project.toApiPayload(), {
      publish: true,
    });

    await pipelineApi.expectNoPipelineRecsInDb(published.id);
  });
});
