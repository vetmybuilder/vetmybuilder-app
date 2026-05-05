import { test } from "../../../src/ui.fixtures";
import Project from "../../../src/models/Project";

test.describe("Projects list filters", () => {
  test("type filter hides projects that don't match the selected type", async ({
    projectApi,
    homeownerProjectsPage,
  }) => {
    const plumbing = await projectApi.createProject(
      Project.aProject()
        .withRandomDetails({ workTypes: ["Plumbing"] })
        .toApiPayload(),
    );
    const electrical = await projectApi.createProject(
      Project.aProject()
        .withRandomDetails({ workTypes: ["Electrical"] })
        .toApiPayload(),
    );

    await homeownerProjectsPage.goto();
    await homeownerProjectsPage.hasProjectVisible(plumbing.id);
    await homeownerProjectsPage.hasProjectVisible(electrical.id);

    await homeownerProjectsPage.selectTypeFilter("Plumbing");
    await homeownerProjectsPage.hasProjectVisible(plumbing.id);
    await homeownerProjectsPage.hasNoProject(electrical.id);
  });

  test("clearing the type filter restores the full list", async ({
    projectApi,
    homeownerProjectsPage,
  }) => {
    const plumbing = await projectApi.createProject(
      Project.aProject()
        .withRandomDetails({ workTypes: ["Plumbing"] })
        .toApiPayload(),
    );
    const electrical = await projectApi.createProject(
      Project.aProject()
        .withRandomDetails({ workTypes: ["Electrical"] })
        .toApiPayload(),
    );

    await homeownerProjectsPage.goto();
    await homeownerProjectsPage.selectTypeFilter("Plumbing");
    await homeownerProjectsPage.hasNoProject(electrical.id);

    await homeownerProjectsPage.clearTypeFilter();
    await homeownerProjectsPage.hasProjectVisible(plumbing.id);
    await homeownerProjectsPage.hasProjectVisible(electrical.id);
  });
});
