import { test, expect } from "../../../src/fixtures";
import Project from "../../../src/models/Project";
import Recommendation from "../../../src/models/Recommendation";

test.describe("GET /api/admin/projects", () => {
  test("returns project list for admin", async ({
    projectApi,
    adminApi,
  }) => {
    const project = await projectApi.createProject(
      Project.aProject().withRandomDetails().toApiPayload(),
    );

    const found = await adminApi.expectProjectInList(project.id);
    expect(found.name).toBe(project.name);
  });

  test("filters by status", async ({
    projectApi,
    adminApi,
  }) => {
    await projectApi.createLiveProject(
      Project.aProject().withRandomDetails().toApiPayload(),
    );

    const { items } = await adminApi.getProjects("status=live");
    expect(items.length).toBeGreaterThanOrEqual(1);

    for (const item of items) {
      expect(item.status).toBe("live");
    }
  });

  test("searches by name", async ({
    projectApi,
    adminApi,
  }) => {
    const uniqueName = `Unique Search Term ${Date.now()}`;
    const payload = Project.aProject().withRandomDetails().toApiPayload();
    payload.name = uniqueName;

    await projectApi.createProject(payload);

    const { items, total } = await adminApi.getProjects(
      `q=${encodeURIComponent(uniqueName.toLowerCase())}`,
    );
    expect(total).toBeGreaterThanOrEqual(1);
    expect(items.some((p: any) => p.name === uniqueName)).toBe(true);
  });

  test("returns 403 for non-admin", async ({ apiClient }) => {
    const res = await apiClient.get("/api/admin/projects");
    expect(res.status()).toBe(403);
  });
});

test.describe("DELETE /api/admin/projects/:id", () => {
  test("admin can delete a project and its related data", async ({
    projectApi,
    projectRecommendationApi,
    adminApi,
  }) => {
    const project = await projectApi.createLiveProject(
      Project.aProject().withRandomDetails().toApiPayload(),
    );

    await projectRecommendationApi.createRecommendation(
      project.id,
      Recommendation.aRecommendation().withRandomDetails().toPayload(),
    );

    await adminApi.deleteProject(project.id);
    await adminApi.expectProjectNotInList(project.id);
  });

  test("returns 404 for non-existent project", async ({
    adminApiClient,
  }) => {
    const res = await adminApiClient.del("/api/admin/projects/999999");
    expect(res.status()).toBe(404);
  });

  test("returns 400 for invalid ID", async ({ adminApiClient }) => {
    const res = await adminApiClient.del("/api/admin/projects/abc");
    expect(res.status()).toBe(400);
  });

  test("returns 403 for non-admin", async ({ apiClient, projectApi }) => {
    const project = await projectApi.createProject(
      Project.aProject().withRandomDetails().toApiPayload(),
    );

    const res = await apiClient.del(`/api/admin/projects/${project.id}`);
    expect(res.status()).toBe(403);
  });
});
