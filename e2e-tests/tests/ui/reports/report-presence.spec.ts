import { test, expect } from "../../../src/ui.fixtures";
import Project from "../../../src/models/Project";
import Recommendation from "../../../src/models/Recommendation";
import Account from "../../../src/models/Account";
import { createAuthUser } from "../../../src/helpers/FirebaseSeed";
import { authedApiForUid } from "../../../src/api/services/client";
import { AuthApi } from "../../../src/apiHelper/auth/AuthApi";
import { RecommendationApi } from "../../../src/apiHelper/project/ProjectRecommendationApi";
import { setupTradesmanProfile } from "../../../src/apiHelper/tradesman/setupTradesmanProfile";
import ReportModal from "../../../src/pages/ReportModal";

test.describe("Report button presence and submission", () => {
  test("report button is visible on /tradesman/[id] and submits successfully", async ({
    page,
    request,
    runtime,
  }) => {
    const { uid } = await setupTradesmanProfile({
      request,
      apiBaseUrl: runtime.apiBaseUrl,
    });

    await page.goto(`/tradesman/${uid}`);
    await expect(page.getByTestId("tradesman-page")).toBeVisible({ timeout: 15_000 });


    const reportBtn = page.getByTestId("btn-report-profile");
    await expect(reportBtn).toBeVisible();

    await reportBtn.click();

    const modal = new ReportModal(page);
    await modal.submitReport("Spam or advertising", "Test report from e2e");
  });

  test("report button is visible on /builders/[id] and submits successfully", async ({
    page,
    request,
    runtime,
    projectApi,
  }) => {
    const project = await projectApi.createLiveProject(
      Project.aProject().withRandomDetails().toApiPayload(),
    );

    // Create a neighbour to make a recommendation
    const email = `neighbour+${Date.now()}@test.com`;
    const neighbourAuth = await createAuthUser(email, "Passw0rd!");
    const neighbourClient = await authedApiForUid(request, runtime.apiBaseUrl, neighbourAuth.uid);
    await AuthApi.signup(neighbourClient, Account.anAccount().withRandomDetails().withEmail(email).withPassword("Passw0rd!"));

    const recApi = new RecommendationApi(neighbourClient);
    const { recommendationId } = await recApi.createRecommendation(
      project.id,
      Recommendation.aRecommendation().withRandomDetails().toPayload(),
    );

    await page.goto(`/builders/${recommendationId}`);

    await expect(page.getByTestId("btn-report-profile")).toBeVisible({ timeout: 15_000 });

    await page.getByTestId("btn-report-profile").click();

    const modal = new ReportModal(page);
    await modal.submitReport("Abusive or threatening content");
  });

  test("report link is visible on shortlist recommendation cards", async ({
    page,
    request,
    runtime,
    projectApi,
  }) => {
    const project = await projectApi.createLiveProject(
      Project.aProject().withRandomDetails().toApiPayload(),
    );

    const email = `neighbour+${Date.now()}@test.com`;
    const neighbourAuth = await createAuthUser(email, "Passw0rd!");
    const neighbourClient = await authedApiForUid(request, runtime.apiBaseUrl, neighbourAuth.uid);
    await AuthApi.signup(neighbourClient, Account.anAccount().withRandomDetails().withEmail(email).withPassword("Passw0rd!"));

    const recApi = new RecommendationApi(neighbourClient);
    await recApi.createRecommendation(
      project.id,
      Recommendation.aRecommendation().withRandomDetails().toPayload(),
    );

    await page.goto(`/projects/${project.id}/shortlist`);

    await expect(page.getByTestId("recommendations-list")).toBeVisible({ timeout: 15_000 });

    const reportLink = page.getByTestId("btn-report-recommendation").first();
    await expect(reportLink).toBeVisible();

    await reportLink.click();

    const modal = new ReportModal(page);
    await modal.submitReport("Fake or misleading review");
  });

  test("shows ALREADY_REPORTED when reporting the same target twice", async ({
    page,
    request,
    runtime,
  }) => {
    const { uid } = await setupTradesmanProfile({
      request,
      apiBaseUrl: runtime.apiBaseUrl,
    });

    await page.goto(`/tradesman/${uid}`);
    await expect(page.getByTestId("tradesman-page")).toBeVisible({ timeout: 15_000 });


    // First report
    await page.getByTestId("btn-report-profile").click();
    const modal = new ReportModal(page);
    await modal.submitReport("Spam or advertising");
    await modal.close();

    // Second report on same target
    await page.getByTestId("btn-report-profile").click();
    const modal2 = new ReportModal(page);
    await modal2.expectVisible();
    await modal2.selectCategory("Spam or advertising");
    await modal2.submit();
    await modal2.expectAlreadyReported();
  });
});
