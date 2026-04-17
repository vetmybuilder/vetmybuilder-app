import { test, expect } from "../../../src/fixtures";
import Project from "../../../src/models/Project";
import Recommendation from "../../../src/models/Recommendation";
import Tradesman from "../../../src/models/tradesman";
import { setupTradesmanProfile } from "../../../src/apiHelper/tradesman/setupTradesmanProfile";

test.describe("Recommendation tradesman notifications", () => {
  test("notifies an onboarded tradesman when their company is recommended", async ({
    request,
    runtime,
    projectApi,
    projectRecommendationApi,
  }) => {
    const companyName = `E2E Notify Builder ${Date.now()} Ltd`;

    const { tradesmanNotificationsApi } = await setupTradesmanProfile({
      request,
      apiBaseUrl: runtime.apiBaseUrl,
      tradesman: Tradesman.aTradesman()
        .withRandomDetails()
        .withCompanyName(companyName),
    });

    const project = await projectApi.createLiveProject(
      Project.aProject().withRandomDetails().toApiPayload(),
    );

    const rec = Recommendation.aRecommendation()
      .withRandomDetails()
      .withCompany(companyName);

    await projectRecommendationApi.createRecommendation(
      project.id,
      rec.toPayload(),
    );

    // The notification is fire-and-forget so give the server a moment
    await new Promise((r) => setTimeout(r, 500));

    const notification =
      await tradesmanNotificationsApi.findLatestByType(
        "recommendation_for_tradesman",
      );

    expect(notification).toBeTruthy();
    expect(notification!.projectId).toBe(project.id);
    expect(notification!.message).toContain("recommended");
    expect(notification!.linkPath).toBe(`/projects/${project.id}`);
  });

  test("does not notify when company name does not match", async ({
    request,
    runtime,
    projectApi,
    projectRecommendationApi,
  }) => {
    const { tradesmanNotificationsApi } = await setupTradesmanProfile({
      request,
      apiBaseUrl: runtime.apiBaseUrl,
    });

    const project = await projectApi.createLiveProject(
      Project.aProject().withRandomDetails().toApiPayload(),
    );

    const rec = Recommendation.aRecommendation()
      .withRandomDetails()
      .withCompany(`Completely Unrelated Company ${Date.now()} Ltd`);

    await projectRecommendationApi.createRecommendation(
      project.id,
      rec.toPayload(),
    );

    await new Promise((r) => setTimeout(r, 500));

    const notification =
      await tradesmanNotificationsApi.findLatestByType(
        "recommendation_for_tradesman",
      );

    expect(notification).toBeNull();
  });

  test("does not double-notify for same tradesman on same project", async ({
    request,
    runtime,
    projectApi,
    projectRecommendationApi,
  }) => {
    const companyName = `E2E Dedup Builder ${Date.now()} Ltd`;

    const { tradesmanNotificationsApi } = await setupTradesmanProfile({
      request,
      apiBaseUrl: runtime.apiBaseUrl,
      tradesman: Tradesman.aTradesman()
        .withRandomDetails()
        .withCompanyName(companyName),
    });

    const project = await projectApi.createLiveProject(
      Project.aProject().withRandomDetails().toApiPayload(),
    );

    const rec1 = Recommendation.aRecommendation()
      .withRandomDetails()
      .withCompany(companyName);

    const rec2 = Recommendation.aRecommendation()
      .withRandomDetails()
      .withCompany(companyName);

    await projectRecommendationApi.createRecommendation(
      project.id,
      rec1.toPayload(),
    );

    // Wait for the first notification to be inserted before the second recommendation
    await new Promise((r) => setTimeout(r, 500));

    await projectRecommendationApi.createRecommendation(
      project.id,
      rec2.toPayload(),
    );

    await new Promise((r) => setTimeout(r, 500));

    const all = await tradesmanNotificationsApi.findAllByType(
      "recommendation_for_tradesman",
    );

    expect(all).toHaveLength(1);
    expect(all[0].projectId).toBe(project.id);
  });
});
