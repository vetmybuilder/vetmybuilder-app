import { test, expect } from "../../../src/fixtures";
import Project from "../../../src/models/Project";

test.describe("Pipeline auto-surface on project publish", () => {
  // Skip in CI: auto-surface is fire-and-forget after res.json() and the async
  // insert doesn't reliably complete in Docker. Covered by unit tests instead.
  test.skip("approved pipeline entry appears as recommendation when project is published with matching trade and location", async ({
    projectApi,
    pipelineApi,
  }) => {
    await pipelineApi.insertEntry({
      companyName: "E2E Pipeline Plumbing Ltd",
      tradeTypes: "plumber",
      serviceAreas: "E4",
      googleRating: 4.5,
      googleReviewsCount: 30,
      vettingScore: 80,
      status: "approved",
      phone: "07700 900100",
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

    await pipelineApi.expectPipelineRecInDb(published.id, "E2E Pipeline Plumbing Ltd");
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
