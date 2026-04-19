import { test, expect } from "../../../src/fixtures";
import Project from "../../../src/models/Project";

test.describe("Pipeline recommendations via API", () => {
  test("pipeline recommendation with source=pipeline is returned by the recommendations API", async ({
    projectApi,
    pipelineApi,
    apiClient,
  }) => {
    const project = Project.aProject().withRandomDetails({
      category: "Plumbing",
      workTypes: ["Bathroom Plumbing"],
      locationQuery: "E4",
      locationPick: "E4 0BQ",
    });
    const created = await projectApi.createProject(project.toApiPayload());

    await pipelineApi.insertPipelineRecommendation(created.id, "E2E Pipeline Plumbing Ltd");

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

  test("pipeline recommendation includes linked_tradesman_uid field", async ({
    projectApi,
    pipelineApi,
    apiClient,
  }) => {
    const project = Project.aProject().withRandomDetails({
      category: "Plumbing",
      workTypes: ["Bathroom Plumbing"],
      locationQuery: "E4",
      locationPick: "E4 0BQ",
    });
    const created = await projectApi.createProject(project.toApiPayload());

    await pipelineApi.insertPipelineRecommendation(created.id, "E2E Linked Test Ltd");

    const res = await apiClient.get(
      `/api/projects/${created.id}/recommendations?limit=50`,
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    const items = body.items ?? [];
    const rec = items.find(
      (r: any) => r.source === "pipeline" && r.company === "E2E Linked Test Ltd",
    );
    expect(rec, "Pipeline rec should appear").toBeTruthy();
    expect(rec).toHaveProperty("linked_tradesman_uid");
  });

  test("pipeline recommendation does not appear when none are inserted", async ({
    projectApi,
    apiClient,
  }) => {
    const project = Project.aProject().withRandomDetails({
      category: "Plumbing",
      workTypes: ["Bathroom Plumbing"],
      locationQuery: "E4",
      locationPick: "E4 0BQ",
    });
    const created = await projectApi.createProject(project.toApiPayload());

    const res = await apiClient.get(
      `/api/projects/${created.id}/recommendations?limit=50`,
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    const items = body.items ?? [];
    const pipelineRecs = items.filter((r: any) => r.source === "pipeline");
    expect(pipelineRecs.length).toBe(0);
  });
});
