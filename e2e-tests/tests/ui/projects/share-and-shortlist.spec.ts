import { test } from "../../../src/ui.fixtures";
import Project from "../../../src/models/Project";
import Recommendation from "../../../src/models/Recommendation";

test.describe("Share link and shortlist", () => {
  test("guest can recommend via a magic link shared by the homeowner", async ({
    projectApi,
    basePage,
    magicLinkPage,
  }) => {
    const project = Project.aProject().withRandomDetails();
    const created = await projectApi.createProject(project.toApiPayload(), {
      publish: true,
    });

    const token = await projectApi.getMagicLink(created.id);

    await basePage.logoutViaUrl();

    const recommendation = Recommendation.aRecommendation();
    await magicLinkPage.visit(token);
    await magicLinkPage.submit(recommendation);
    await magicLinkPage.hasSubmitConfirmation();
  });

  test("homeowner can view all recommendations on the shortlist page", async ({
    projectApi,
    recommendationApi,
    shortlistPage,
  }) => {
    const project = Project.aProject().withRandomDetails();
    const created = await projectApi.createProject(project.toApiPayload(), {
      publish: true,
    });

    await recommendationApi.createRecommendation(
      created.id,
      Recommendation.aRecommendation().toPayload(),
    );

    await shortlistPage.visit(created.id);
    await shortlistPage.hasRecommendations();
  });
});
