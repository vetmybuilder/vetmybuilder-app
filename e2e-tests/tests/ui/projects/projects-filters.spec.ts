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
    projectApi,
    homeownerProjectsPage,
  }) => {
    // Create two live projects (projects now start as live); archive one of them
    const liveProject = await projectApi.createProject(
      Project.aProject().withRandomDetails().toApiPayload(),
    );

    const archivedProject = await projectApi.createProject(
      Project.aProject().withRandomDetails().toApiPayload(),
    );
    await projectApi.closeProject(archivedProject.id, { didGoAhead: false });

    await homeownerProjectsPage.goto();

    // Both visible on the default tab before filtering
    await expect(
      homeownerProjectsPage.findProjectById(liveProject.id),
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      homeownerProjectsPage.findProjectById(archivedProject.id),
    ).toBeVisible({ timeout: 10_000 });

    // Filter by Archived — only the archived project should remain
    await homeownerProjectsPage.selectStatusFilter("Archived");

    await expect(
      homeownerProjectsPage.findProjectById(archivedProject.id),
    ).toBeVisible({ timeout: 10_000 });
    await homeownerProjectsPage.hasNoProject(liveProject.id);
  });
});
