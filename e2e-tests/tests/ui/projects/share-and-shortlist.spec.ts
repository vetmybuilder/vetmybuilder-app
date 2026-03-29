import { test } from "../../../src/ui.fixtures";
import Project from "../../../src/models/Project";
import Recommendation from "../../../src/models/Recommendation";

test.describe("Share link and shortlist", () => {
  test("guest can recommend via a magic link shared by the homeowner", async ({
    apiClient,
    projectApi,
    basePage,
    magicLinkPage,
  }) => {
    const project = Project.aProject().withRandomDetails();
    const created = await projectApi.createProject(project.toApiPayload(), {
      publish: true,
    });

    const linkRes = await apiClient.post(
      `/api/projects/${created.id}/magic-link`,
    );
    const { token } = await linkRes.json();

    await basePage.logout();

    const recommendation = Recommendation.aRecommendation();
    await magicLinkPage.visit(token);
    await magicLinkPage.submit(recommendation);
    await magicLinkPage.hasSubmitConfirmation();
  });

  test("homeowner can view all recommendations on the shortlist page", async ({
    apiClient,
    projectApi,
    shortlistPage,
  }) => {
    const project = Project.aProject().withRandomDetails();
    const created = await projectApi.createProject(project.toApiPayload(), {
      publish: true,
    });

    await apiClient.post(
      `/api/projects/${created.id}/recommendations`,
      Recommendation.aRecommendation().toPayload(),
    );

    await shortlistPage.visit(created.id);
    await shortlistPage.hasRecommendations();
  });
});
