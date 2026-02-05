import Project from "../../../src/models/Project";
import { test } from "../../../src/ui.fixtures";

test.describe("Project publish journey", () => {
  test("can publish a project", async ({
    projectApi,
    projectDetailsPage,
    homeownerProjectsPage,
  }) => {
    const project = Project.aProject().withRandomDetails();
    const created = await projectApi.createProject(project.toApiPayload());

    await projectDetailsPage.visit(created.id);
    await projectDetailsPage.hasStatus("Pending");

    await projectDetailsPage.publish();
    await projectDetailsPage.hasStatus("Live");

    await projectDetailsPage.goBack();
    await homeownerProjectsPage.hasStatus(created.id, "LIVE");
  });
});
