import { test, expect } from "../../../src/ui.fixtures";
import Project from "../../../src/models/Project";
import Recommendation from "../../../src/models/Recommendation";

test.describe("Google rating chip on builder profile", () => {
  test("does not display when tradesman has no Google data", async ({
    projectApi,
    recommendationApi,
    builderProfilePage,
  }) => {
    const project = await projectApi.createLiveProject(
      Project.aProject().withRandomDetails().toApiPayload(),
    );

    const rec = Recommendation.aRecommendation().withRandomDetails();
    const { recommendationId } =
      await recommendationApi.createRecommendation(
        project.id,
        rec.toPayload(),
      );

    await builderProfilePage.visit(recommendationId);
    await expect(builderProfilePage.companyName).toBeVisible();
    await expect(builderProfilePage.googleRatingChip).not.toBeVisible();
  });
});
