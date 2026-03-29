import { test, expect } from "../../../src/ui.fixtures";
import Project from "../../../src/models/Project";
import Account from "../../../src/models/Account";
import Recommendation from "../../../src/models/Recommendation";
import { RecommendationApi } from "../../../src/apiHelper/project/ProjectRecommendationApi";
import { createAuthUser } from "../../../src/helpers/FirebaseSeed";
import { authedApiForUid } from "../../../src/api/services/client";
import { AuthApi } from "../../../src/apiHelper/auth/AuthApi";

test.describe("Builder profile", () => {
  test("homeowner can navigate back from builder profile to project", async ({
    request,
    runtime,
    projectApi,
    builderProfilePage,
  }) => {
    const location = "E4";
    const password = "Passw0rd!";

    const project = Project.aProject().withRandomDetails({
      locationQuery: location,
      locationPick: location,
    });

    const created = await projectApi.createProject(project.toApiPayload());
    await projectApi.publishProject(created.id);

    // Seed a neighbour recommendation so there is a builder profile to visit
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

    const recommendation = Recommendation.aRecommendation();
    const recApi = new RecommendationApi(neighbourClient);
    const { recommendationId } = await recApi.createRecommendation(
      created.id,
      recommendation.toPayload(),
    );

    await builderProfilePage.visit(recommendationId);
    await builderProfilePage.goBackToProject();
  });

  test("homeowner can vote up a builder recommendation", async ({
    request,
    runtime,
    projectApi,
    builderProfilePage,
  }) => {
    const location = "E4";
    const password = "Passw0rd!";

    const project = Project.aProject().withRandomDetails({
      locationQuery: location,
      locationPick: location,
    });

    const created = await projectApi.createProject(project.toApiPayload());
    await projectApi.publishProject(created.id);

    // Seed a neighbour recommendation so there is a builder profile to vote on
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

    const recommendation = Recommendation.aRecommendation();
    const recApi = new RecommendationApi(neighbourClient);
    const { recommendationId } = await recApi.createRecommendation(
      created.id,
      recommendation.toPayload(),
    );

    await builderProfilePage.visit(recommendationId);
    await builderProfilePage.voteUp();
    await builderProfilePage.hasVotedUp();
  });
});
