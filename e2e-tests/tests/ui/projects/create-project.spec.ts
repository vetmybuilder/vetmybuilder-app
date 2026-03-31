import { test } from "../../../src/ui.fixtures";
import Project from "../../../src/models/Project";
// passing
test.describe("Homeowner projects", () => {
  // This test drives the full multi-step create-project form and then validates
  // the resulting project page — it is inherently the slowest test in the suite.
  test("can create a project and lands on the project page", async ({
    createProjectPage,
    projectDetailsPage,
    homeownerProjectsPage,
  }, testInfo) => {
    const isMobile = testInfo.project.name.startsWith("ui-mobile-");
    // webkit is ~50% slower than chromium under Docker resource pressure
    test.setTimeout(isMobile ? 240_000 : 180_000);

    const project = Project.aProject().withRandomDetails({
      category: "Appliances",
      workTypes: ["Tumble Dryer Installation"],
      locationQuery: "E4",
      locationPick: "E4 0BQ",
      propertyType: "Semi-Detached",
      bedrooms: 4,
      timeframe: "Urgent (1-2 weeks)",
      budget: "£30k-£60k",
      materials: "Supplied by homeowner",
      access: "Parking available",
      extraNotes: "Install new tumble dryer and ensure correct ventilation.",
    });

    const projectId = await createProjectPage.createProject(
      project.toCreateInput(),
      isMobile,
    );

    await projectDetailsPage.hasProjectDetails(projectId, project, {
      status: "Pending",
      dates: { createdAt: new Date() },
    });

    await projectDetailsPage.hasTopRecommendations(false);
    await projectDetailsPage.hasSpotlight(false);

    await projectDetailsPage.goBack();

    await homeownerProjectsPage.hasProject([project]);
  });
});
