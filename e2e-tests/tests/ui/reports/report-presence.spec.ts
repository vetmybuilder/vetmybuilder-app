import { test } from "../../../src/ui.fixtures";
import Project from "../../../src/models/Project";
import Recommendation from "../../../src/models/Recommendation";
import { RecommendationApi } from "../../../src/apiHelper/project/ProjectRecommendationApi";
import { setupTradesmanProfile } from "../../../src/apiHelper/tradesman/setupTradesmanProfile";
import { createHomeownerAccount } from "../../../src/apiHelper/account/createHomeownerAccount";
import ReportModal from "../../../src/pages/ReportModal";

test.describe("Report a profile", () => {
  test("homeowner can report a tradesperson from /tradesman/[id]", async ({
    request,
    runtime,
    tradesmanPublicProfilePage,
    page,
  }) => {
    const { uid } = await setupTradesmanProfile({
      request,
      apiBaseUrl: runtime.apiBaseUrl,
    });

    await tradesmanPublicProfilePage.visit(uid);
    await tradesmanPublicProfilePage.clickReport();

    const modal = new ReportModal(page);
    await modal.submitReport("Spam", "Test report from e2e");
  });

  test("homeowner can report a recommendation from /builders/[id]", async ({
    request,
    runtime,
    projectApi,
    builderProfilePage,
    page,
  }) => {
    const project = await projectApi.createLiveProject(
      Project.aProject().withRandomDetails().toApiPayload(),
    );

    const neighbour = await createHomeownerAccount({
      request,
      apiBaseUrl: runtime.apiBaseUrl,
      emailPrefix: "rec-author",
    });
    const { recommendationId } = await new RecommendationApi(
      neighbour.client,
    ).createRecommendation(
      project.id,
      Recommendation.aRecommendation().withRandomDetails().toPayload(),
    );

    await builderProfilePage.visit(recommendationId);
    await builderProfilePage.clickReport();

    const modal = new ReportModal(page);
    await modal.submitReport("Abusive");
  });

  test("re-reporting the same tradesperson shows the already-reported state", async ({
    request,
    runtime,
    tradesmanPublicProfilePage,
    page,
  }) => {
    const { uid } = await setupTradesmanProfile({
      request,
      apiBaseUrl: runtime.apiBaseUrl,
    });

    await tradesmanPublicProfilePage.visit(uid);

    await tradesmanPublicProfilePage.clickReport();
    const first = new ReportModal(page);
    await first.submitReport("Spam");
    await first.close();

    await tradesmanPublicProfilePage.clickReport();
    const second = new ReportModal(page);
    await second.expectVisible();
    await second.selectCategory("Spam");
    await second.submit();
    await second.expectAlreadyReported();
  });
});
