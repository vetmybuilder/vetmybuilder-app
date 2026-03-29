import { test } from "../../../src/ui.fixtures";
import Project from "../../../src/models/Project";

test.describe("Projects page", () => {
  test("shows safety verification card and filters when projects exist", async ({
    apiClient,
    homeownerProjectsPage,
  }) => {
    // Create a project so the filters have data to render against
    await apiClient.post(
      "/api/projects",
      Project.aProject().withRandomDetails().toApiPayload(),
    );

    await homeownerProjectsPage.goto();

    await homeownerProjectsPage.assertSafetyVerificationCardVisible();
    await homeownerProjectsPage.assertFiltersVisible();
  });
});
