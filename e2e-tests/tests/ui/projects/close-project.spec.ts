import { test } from "../../../src/ui.fixtures";
import Project from "../../../src/models/Project";
import Account from "../../../src/models/Account";
import Recommendation from "../../../src/models/Recommendation";
import { RecommendationApi } from "../../../src/apiHelper/project/ProjectRecommendationApi";
import { createAuthUser } from "../../../src/helpers/FirebaseSeed";
import { authedApiForUid } from "../../../src/api/services/client";
import { AuthApi } from "../../../src/apiHelper/auth/AuthApi";

test.describe("Homeowner projects", () => {
  test("can unarchive a closed project", async ({
    apiClient,
    projectDetailsPage,
  }) => {
    const { project } = await (
      await apiClient.post(
        "/api/projects",
        Project.aProject().withRandomDetails().toApiPayload(),
      )
    ).json();

    await apiClient.post(`/api/projects/${project.id}/close`, {
      didGoAhead: false,
      reasons: ["budget"],
    });

    await projectDetailsPage.visit(project.id);
    await projectDetailsPage.hasStatus("Archived");
    await projectDetailsPage.unarchive();
  });
});

// passing
test.describe("Homeowner projects", () => {
  test("can close a project that didn't go ahead", async ({
    projectApi,
    projectDetailsPage,
  }) => {
    const project = Project.aProject().withRandomDetails();

    const created = await projectApi.createProject(project.toApiPayload());
    const projectId = created.id;

    await projectDetailsPage.visit(projectId);

    await projectDetailsPage.closeProject({
      didGoAhead: false,
      reasons: ["budget", "quote_too_high"],
    });

    await projectDetailsPage.hasStatus("Archived");
  });

  test("can close a project with a winner", async ({
    request,
    runtime,
    projectApi,
    projectDetailsPage,
  }) => {
    const location = "E4";
    const password = "Passw0rd!";

    const project = Project.aProject().withRandomDetails({
      locationQuery: location,
      locationPick: location,
    });

    const created = await projectApi.createProject(project.toApiPayload());
    await projectApi.publishProject(created.id);

    // Seed a recommendation from a separate neighbour user so the winner
    // dropdown in the close modal has an entry to select.
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
    await recApi.createRecommendation(created.id, recommendation.toPayload());

    await projectDetailsPage.visit(created.id);

    await projectDetailsPage.closeProject({ //failing on this line
      didGoAhead: true,
      tradespersonLabel: recommendation.company,
    });
    await projectDetailsPage.hasStatus("Completed");
  });
});
