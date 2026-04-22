import { test } from "../../../src/ui.fixtures";
import Project from "../../../src/models/Project";
import Tradesman from "../../../src/models/tradesman";
import { setupOwnerWithLiveProject } from "../../../src/apiHelper/project/setupOwnerWithLiveProject";

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
      budget: "5k - 15k",
      materials: "Supplied by tradesman",
      access: "Parking available",
      extraNotes: "Full installation with ventilation setup.",
    });

    const created = await projectApi.createProject(project.toApiPayload(), {
      publish: true,
    });

    await projectDetailsPage.visit(created.id);

    await projectDetailsPage.expectInsightsVisible();
    await projectDetailsPage.expectInsightsContains("Project Insights");
    await projectDetailsPage.expectInsightsContains("Tumble Dryer Installation");
  });

  test("insights card appears on a draft project (classification runs on creation)", async ({
    projectApi,
    projectDetailsPage,
  }) => {
    const project = Project.aProject().withRandomDetails();

    const created = await projectApi.createProject(project.toApiPayload());

    await projectDetailsPage.visit(created.id);
    await projectDetailsPage.expectInsightsVisible();
    await projectDetailsPage.expectInsightsContains("Project Insights");
  });

  test("insights card appears in the tradesman accordion view", async ({
    request,
    runtime,
    apiClient,
    adminApi,
    tradesmanProjectsPage,
  }) => {
    const location = "E4";

    const { projectId } = await setupOwnerWithLiveProject({
      request,
      apiBaseUrl: runtime.apiBaseUrl,
      location,
    });

    const tradesman = Tradesman.aTradesman().withRandomDetails();
    tradesman.serviceAreas = location;
    tradesman.tradeTypes = "General Builder";
    await apiClient.put("/api/tradesmen/me", {
      ...tradesman.toPayload(),
      service_areas: location,
      trade_types: "General Builder",
    });

    const tradesmanUid = await apiClient.getTradesmanUserId();
    await adminApi.setTradesmanStatus(tradesmanUid, "active");
    await apiClient.unlockProjectWithMockPayment(projectId);

    await tradesmanProjectsPage.visit();
    await tradesmanProjectsPage.expandProject(projectId);

    await tradesmanProjectsPage.expectInsightsVisible(projectId);
    await tradesmanProjectsPage.expectInsightsContains(projectId, "Project Insights");
  });
});
