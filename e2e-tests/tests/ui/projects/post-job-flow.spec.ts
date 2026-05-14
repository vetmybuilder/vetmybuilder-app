import { test } from "../../../src/ui.fixtures";
import Project from "../../../src/models/Project";

test.describe("Post a job", () => {
  test("Guest is asked to sign up after seeing their matches", async ({
    basePage,
    createProjectPage,
    registerPage,
  }, testInfo) => {
    const isMobile = testInfo.project.name.startsWith("ui-mobile-");
    test.setTimeout(isMobile ? 240_000 : 180_000);

    const job = Project.aProject().withRandomDetails({
      category: "Appliances",
      workTypes: ["Tumble Dryer Installation"],
      locationQuery: "E4",
      locationPick: "E4 0BQ",
      propertyType: "Semi-Detached",
      bedrooms: 4,
      timeframe: "Urgent (1-2 weeks)",
      budget: "5k - 15k",
      materials: "Supplied by tradesman",
      access: "Parking available",
      extraNotes: "Install new tumble dryer and ensure correct ventilation.",
    });

    await basePage.logoutViaUrl();
    await createProjectPage.fillWizardThroughReview(
      job.toCreateInput(),
      isMobile,
    );
    await createProjectPage.hasMatchReveal({ cta: "signup" });
    await createProjectPage.clickSignup();
    await registerPage.hasForm();
  });

  test("Homeowner views their matched tradespeople", async ({
    createProjectPage,
    projectDetailsPage,
  }, testInfo) => {
    const isMobile = testInfo.project.name.startsWith("ui-mobile-");
    test.setTimeout(isMobile ? 240_000 : 180_000);

    const job = Project.aProject().withRandomDetails({
      category: "Appliances",
      workTypes: ["Tumble Dryer Installation"],
      locationQuery: "E4",
      locationPick: "E4 0BQ",
      propertyType: "Semi-Detached",
      bedrooms: 4,
      timeframe: "Urgent (1-2 weeks)",
      budget: "5k - 15k",
      materials: "Supplied by tradesman",
      access: "Parking available",
      extraNotes: "Install new tumble dryer and ensure correct ventilation.",
    });

    await createProjectPage.fillWizardThroughReview(
      job.toCreateInput(),
      isMobile,
    );
    await createProjectPage.hasMatchReveal({ cta: "view-tradespeople" });
    await createProjectPage.clickViewTradespeople();
    await projectDetailsPage.assertJobMetadataVisible(job);
  });
});
