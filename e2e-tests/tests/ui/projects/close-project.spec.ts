import { test } from "../../../src/ui.fixtures";
import Project from "../../../src/models/Project";
// passing
test.describe("Homeowner projects", () => {
  test("can close a project that didn't go ahead", async ({
    projectApi,
    projectDetailsPage,
  }) => {
    const project = Project.aProject().withRandomDetails();

    const created = await projectApi.createProject(project.toApiPayload());
    const projectId = created.id;

    await projectDetailsPage.visit(projectId);

    await projectDetailsPage.closeProject({
      didGoAhead: false,
      reasons: ["budget", "quote_too_high"],
    });

    await projectDetailsPage.hasStatus("Archived");
  });
});
