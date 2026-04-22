import { test } from "../../../src/ui.fixtures";
import Project from "../../../src/models/Project";
import Tradesman from "../../../src/models/tradesman";
import { authedApiForUid } from "../../../src/api/services/client";

test.describe("Project Insights", () => {
  test("insights card appears on a published project with classification data", async ({
    projectApi,
    projectDetailsPage,
  }) => {
    const project = Project.aProject().withRandomDetails({
      category: "Appliances",
      workTypes: ["Tumble Dryer Installation"],
      locationQuery: "E4",
      locationPick: "E4 0BQ",
      propertyType: "Semi-Detached",
      bedrooms: 3,
      timeframe: "Urgent (1-2 weeks)",
      budget: "£5k-£15k",
      materials: "Supplied by tradesman",
      access: "Parking available",
      extraNotes: "Full installation with ventilation setup.",
    });

    const created = await projectApi.createProject(project.toApiPayload(), {
      publish: true,
    });

    await projectDetailsPage.visit(created.id);

    // Stub mode returns "General Builder" classification
    await projectDetailsPage.expectInsightsVisible();
    await projectDetailsPage.expectInsightsContains("Project Insights");
    await projectDetailsPage.expectInsightsContains("General Builder");
  });

  test("insights card appears on a draft project (classification runs on creation)", async ({
    projectApi,
    projectDetailsPage,
  }) => {
    const project = Project.aProject().withRandomDetails();

    const created = await projectApi.createProject(project.toApiPayload());

    await projectDetailsPage.visit(created.id);
    await projectDetailsPage.expectInsightsVisible();
    await projectDetailsPage.expectInsightsContains("General Builder");
  });

  test("insights card appears in the tradesman accordion view", async ({
    request,
    runtime,
    projectApi,
    tradesmanApi,
    adminApi,
    authHelper,
    basePage,
    tradesmanProjectsPage,
  }) => {
    // 1. Create and publish a project as the default homeowner
    const project = Project.aProject().withRandomDetails({
      category: "Appliances",
      workTypes: ["Tumble Dryer Installation"],
      locationQuery: "E4",
      locationPick: "E4 0BQ",
      propertyType: "Semi-Detached",
      bedrooms: 3,
      timeframe: "Urgent (1-2 weeks)",
      budget: "£5k-£15k",
      materials: "Supplied by tradesman",
      access: "Parking available",
      extraNotes: "Full installation with ventilation setup.",
    });

    const created = await projectApi.createProject(project.toApiPayload(), {
      publish: true,
    });

    // 2. Register a tradesman via join + activate
    const tradesman = Tradesman.aTradesman().withRandomDetails();
    const leadId = await tradesmanApi.join(tradesman);
    const tradesmanUid = `e2e-trades-insights-${Date.now()}`;
    await adminApi.setTradesmanStatus(leadId, "active", tradesmanUid);

    // 3. Unlock the job as the tradesman (payment gate)
    const tradesmanClient = await authedApiForUid(request, runtime.apiBaseUrl, tradesmanUid);
    await tradesmanClient.unlockProjectWithMockPayment(created.id);

    // 4. Switch browser session to the tradesman
    await basePage.logoutViaUrl();
    await authHelper.loginAsUid(tradesmanUid);

    // 5. Navigate to tradesman projects and expand the row
    await tradesmanProjectsPage.visit();
    await tradesmanProjectsPage.expandProject(created.id);

    // 6. Assert insights are visible with expected classification
    await tradesmanProjectsPage.expectInsightsVisible(created.id);
    await tradesmanProjectsPage.expectInsightsContains(created.id, "Project Insights");
    await tradesmanProjectsPage.expectInsightsContains(created.id, "General Builder");
  });
});
