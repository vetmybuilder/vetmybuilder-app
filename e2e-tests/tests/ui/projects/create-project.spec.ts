import { test } from "../../../src/ui.base.fixtures";
import Account from "../../../src/models/Account";
import Project from "../../../src/models/Project";

test.describe("Homeowner projects", () => {
  test("can create a project and lands on the project page", async ({
    createProjectPage,
    projectDetailsPage,
    authHelper,
  }, testInfo) => {
    const isMobile = testInfo.project.name.startsWith("ui-mobile-");

    const account = Account.anAccount().withRandomRegistration({
      location: "E4",
    });

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

    await authHelper.loginAsHomeowner({
      firstName: account.firstName,
      lastName: account.lastName,
      location: account.location,
    });

    await createProjectPage.createProject(project.toCreateInput(), isMobile);

    await projectDetailsPage.assertLoaded();
    await projectDetailsPage.assertStatusPending();
    await projectDetailsPage.assertShareAndPublishVisible();
    await projectDetailsPage.assertTopRecommendationsVisible();

    await projectDetailsPage.hasProjectDetails(project);
  });
});
