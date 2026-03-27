import { test, expect } from "../../../src/ui.fixtures";
import Project from "../../../src/models/Project";

test.describe("Projects list filters", () => {
  test("type filter hides projects that don't match the selected type", async ({
    apiClient,
    homeownerProjectsPage,
  }) => {
    // Two projects with distinct work types
    const projectA = Project.aProject().withRandomDetails({
      workTypes: ["Plumbing"],
    });
    const projectB = Project.aProject().withRandomDetails({
      workTypes: ["Electrical"],
    });

    const resA = await apiClient.post("/api/projects", projectA.toApiPayload());
    expect(resA.status()).toBe(201);
    const { project: createdA } = await resA.json();

    const resB = await apiClient.post("/api/projects", projectB.toApiPayload());
    expect(resB.status()).toBe(201);
    const { project: createdB } = await resB.json();

    await homeownerProjectsPage.goto();

    // Both visible before filtering
    await expect(homeownerProjectsPage.findProjectById(createdA.id)).toBeVisible(
      { timeout: 10_000 },
    );
    await expect(homeownerProjectsPage.findProjectById(createdB.id)).toBeVisible(
      { timeout: 10_000 },
    );

    // Filter by Plumbing — only projectA should remain
    await homeownerProjectsPage.selectTypeFilter("Plumbing");

    await expect(homeownerProjectsPage.findProjectById(createdA.id)).toBeVisible(
      { timeout: 10_000 },
    );
    await homeownerProjectsPage.hasNoProject(createdB.id);
  });

  test("status filter hides projects that don't match the selected status", async ({
    apiClient,
    projectApi,
    homeownerProjectsPage,
  }) => {
    // Create a pending project and a live (published) project
    const resA = await apiClient.post(
      "/api/projects",
      Project.aProject().withRandomDetails().toApiPayload(),
    );
    expect(resA.status()).toBe(201);
    const { project: pendingProject } = await resA.json();

    const resB = await apiClient.post(
      "/api/projects",
      Project.aProject().withRandomDetails().toApiPayload(),
    );
    expect(resB.status()).toBe(201);
    const { project: liveProject } = await resB.json();

    await projectApi.publishProject(liveProject.id);

    await homeownerProjectsPage.goto();

    // Both visible on the default tab before filtering
    await expect(
      homeownerProjectsPage.findProjectById(pendingProject.id),
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      homeownerProjectsPage.findProjectById(liveProject.id),
    ).toBeVisible({ timeout: 10_000 });

    // Filter by Pending — only the pending project should remain
    await homeownerProjectsPage.selectStatusFilter("Pending");

    await expect(
      homeownerProjectsPage.findProjectById(pendingProject.id),
    ).toBeVisible({ timeout: 10_000 });
    await homeownerProjectsPage.hasNoProject(liveProject.id);
  });
});
