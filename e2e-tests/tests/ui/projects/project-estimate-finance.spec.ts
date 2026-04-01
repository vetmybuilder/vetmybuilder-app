import { test } from "../../../src/ui.fixtures";
import Project from "../../../src/models/Project";

test.describe("Project estimate and finance banner", () => {
  test("shows a cost estimate range after project creation", async ({
    projectApi,
    projectDetailsPage,
  }) => {
    const project = Project.aProject().withRandomDetails();
    const created = await projectApi.createProject(project.toApiPayload());

    await projectDetailsPage.visit(created.id);
    await projectDetailsPage.hasEstimateVisible();
  });

  test("estimate tooltip explains the calculation basis", async ({
    projectApi,
    projectDetailsPage,
  }) => {
    const project = Project.aProject().withRandomDetails();
    const created = await projectApi.createProject(project.toApiPayload());

    await projectDetailsPage.visit(created.id);
    await projectDetailsPage.hasEstimateTooltip();
  });

  test("estimate remains visible after project is published", async ({
    projectApi,
    projectDetailsPage,
  }) => {
    const project = Project.aProject().withRandomDetails();
    const created = await projectApi.createProject(project.toApiPayload(), {
      publish: true,
    });

    await projectDetailsPage.visit(created.id);
    await projectDetailsPage.hasStatus("Live");
    await projectDetailsPage.hasEstimateVisible();
  });

  test("shows the partner finance banner after project creation", async ({
    projectApi,
    projectDetailsPage,
  }) => {
    const project = Project.aProject().withRandomDetails();
    const created = await projectApi.createProject(project.toApiPayload());

    await projectDetailsPage.visit(created.id);
    await projectDetailsPage.hasFinanceBanner();
  });

  test("finance banner shows personalized estimate text when estimate is available", async ({
    projectApi,
    projectDetailsPage,
  }) => {
    const project = Project.aProject().withRandomDetails();
    const created = await projectApi.createProject(project.toApiPayload());

    await projectDetailsPage.visit(created.id);
    await projectDetailsPage.hasFinanceBannerWithEstimateText();
  });

  test("finance banner shows personal loan and remortgage buttons", async ({
    projectApi,
    projectDetailsPage,
  }) => {
    const project = Project.aProject().withRandomDetails();
    const created = await projectApi.createProject(project.toApiPayload());

    await projectDetailsPage.visit(created.id);
    await projectDetailsPage.hasFinanceBannerButtons();
  });

  test("finance banner persists after project is published", async ({
    projectApi,
    projectDetailsPage,
  }) => {
    const project = Project.aProject().withRandomDetails();
    const created = await projectApi.createProject(project.toApiPayload(), {
      publish: true,
    });

    await projectDetailsPage.visit(created.id);
    await projectDetailsPage.hasStatus("Live");
    await projectDetailsPage.hasFinanceBanner();
    await projectDetailsPage.hasFinanceBannerWithEstimateText();
  });
});
