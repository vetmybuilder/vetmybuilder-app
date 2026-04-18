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
    adminApi,
  }) => {
    const companyName = `E2E Notify Builder ${Date.now()} Ltd`;

    const { uid: tradesmanUid, tradesmanNotificationsApi } = await setupTradesmanProfile({
      request,
      apiBaseUrl: runtime.apiBaseUrl,
      tradesman: Tradesman.aTradesman()
        .withRandomDetails()
        .withCompanyName(companyName),
    });

    // matchAndNotifyTradesman queries WHERE status = 'active'
    await adminApi.setTradesmanStatus(tradesmanUid, "active");

    const project = await projectApi.createLiveProject(
      Project.aProject().withRandomDetails().toApiPayload(),
    );

    await projectRecommendationApi.createRecommendation(
      project.id,
      Recommendation.aRecommendation().withRandomDetails().withCompany(companyName).toPayload(),
    );

    const notification = await tradesmanNotificationsApi.waitForType(
      "recommendation_for_tradesman",
    );

    expect(notification.projectId).toBe(project.id);
    expect(notification.linkPath).toBe(`/projects/${project.id}`);
  });

  test("does not notify when company name does not match", async ({
    request,
    runtime,
    projectApi,
    projectRecommendationApi,
    adminApi,
  }) => {
    const { uid: tradesmanUid, tradesmanNotificationsApi } = await setupTradesmanProfile({
      request,
      apiBaseUrl: runtime.apiBaseUrl,
    });

    await adminApi.setTradesmanStatus(tradesmanUid, "active");

    const project = await projectApi.createLiveProject(
      Project.aProject().withRandomDetails().toApiPayload(),
    );

    await projectRecommendationApi.createRecommendation(
      project.id,
      Recommendation.aRecommendation()
        .withRandomDetails()
        .withCompany(`Completely Unrelated Company ${Date.now()} Ltd`)
        .toPayload(),
    );

    // Give the fire-and-forget path time to complete (if it were going to)
    await new Promise((r) => setTimeout(r, 3_000));

    const notification = await tradesmanNotificationsApi.findLatestByType(
      "recommendation_for_tradesman",
    );
    expect(notification).toBeNull();
  });

  test("does not double-notify for same tradesman on same project", async ({
    request,
    runtime,
    projectApi,
    projectRecommendationApi,
    adminApi,
  }) => {
    const companyName = `E2E Dedup Builder ${Date.now()} Ltd`;

    const { uid: tradesmanUid, tradesmanNotificationsApi } = await setupTradesmanProfile({
      request,
      apiBaseUrl: runtime.apiBaseUrl,
      tradesman: Tradesman.aTradesman()
        .withRandomDetails()
        .withCompanyName(companyName),
    });

    await adminApi.setTradesmanStatus(tradesmanUid, "active");

    const project = await projectApi.createLiveProject(
      Project.aProject().withRandomDetails().toApiPayload(),
    );

    await projectRecommendationApi.createRecommendation(
      project.id,
      Recommendation.aRecommendation().withRandomDetails().withCompany(companyName).toPayload(),
    );

    // Wait for the first notification before sending the second recommendation
    await tradesmanNotificationsApi.waitForType("recommendation_for_tradesman");

    await projectRecommendationApi.createRecommendation(
      project.id,
      Recommendation.aRecommendation().withRandomDetails().withCompany(companyName).toPayload(),
    );

    // Settle and count — should still be exactly 1
    const all = await tradesmanNotificationsApi.waitAndCountByType(
      "recommendation_for_tradesman",
    );

    expect(all).toHaveLength(1);
    expect(all[0].projectId).toBe(project.id);
  });
});
