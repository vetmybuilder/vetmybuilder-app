import { test } from "../../../src/ui.fixtures";
import Project from "../../../src/models/Project";
import Recommendation from "../../../src/models/Recommendation";
import Account from "../../../src/models/Account";
import { createAuthUser } from "../../../src/helpers/FirebaseSeed";
import { authedApiForUid } from "../../../src/api/services/client";
import { AuthApi } from "../../../src/apiHelper/auth/AuthApi";

test.describe("Shortlist interactions", () => {
   test("share button opens the share modal", async ({
    projectApi,
    projectDetailsPage,
  }) => {
    const project = Project.aProject().withRandomDetails();
    const created = await projectApi.createProject(project.toApiPayload());

    await projectDetailsPage.visit(created.id);
    await projectDetailsPage.openShareModal();
    await projectDetailsPage.publishModal.close();
  });

  test("neighbour can vote on a recommendation from the shortlist page", async ({
    request,
    runtime,
    apiClient,
    projectApi,
    loginPage,
    shortlistPage,
  }) => {
    const location = "E4";
    const password = "Passw0rd!";

    const project = Project.aProject()
      .withRandomDetails()
      .withLocation(location);
    const created = await projectApi.createProject(project.toApiPayload(), {
      publish: true,
    });

    await apiClient.post(
      `/api/projects/${created.id}/recommendations`,
      Recommendation.aRecommendation().toPayload(),
    );

    const neighbour = Account.anAccount()
      .withRandomDetails()
      .withLocation(location)
      .withEmail(`neighbour+${Date.now()}@test.com`)
      .withPassword(password);

    const neighbourAuthUser = await createAuthUser(
      neighbour.email!,
      neighbour.password!,
    );

    const neighbourClient = await authedApiForUid(
      request,
      runtime.apiBaseUrl,
      neighbourAuthUser.uid,
    );

    await AuthApi.signup(neighbourClient, neighbour);

    await loginPage.loginExpectSuccess(neighbour.email!, neighbour.password!);

    await shortlistPage.visit(created.id);
    await shortlistPage.hasRecommendations();
    await shortlistPage.hasVoteCount(0);
    await shortlistPage.vote();
    await shortlistPage.hasVoteCount(1);
  });

  test("view more button navigates to the full shortlist when 3+ recommendations exist", async ({
    apiClient,
    projectApi,
    projectDetailsPage,
  }) => {
    const project = Project.aProject().withRandomDetails();
    const created = await projectApi.createProject(project.toApiPayload(), {
      publish: true,
    });

    const companies = [
      "Alpha Builders Ltd",
      "Beta Construction Co",
      "Gamma Plumbing Services",
    ];

    for (const company of companies) {
      await apiClient.post(`/api/projects/${created.id}/recommendations`, {
        ...Recommendation.aRecommendation().toPayload(),
        company,
      });
    }

    await projectDetailsPage.visit(created.id);
    await projectDetailsPage.goToShortlist(created.id);
  });
});
