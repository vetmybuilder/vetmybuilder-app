import { test } from "../../../src/ui.fixtures";
import Project from "../../../src/models/Project";
import Recommendation from "../../../src/models/Recommendation";
import { RecommendationApi } from "../../../src/apiHelper/project/ProjectRecommendationApi";
import { createHomeownerAccount } from "../../../src/apiHelper/account/createHomeownerAccount";

test.describe("Close a job", () => {
  test("closing as 'didn't go ahead' archives the job and the owner can no longer see it", async ({
    projectApi,
    projectDetailsPage,
  }) => {
    // 1. API: owner creates a project (browser is auto-authed as owner
    //    via the apiClient fixture)
    const created = await projectApi.createProject(
      Project.aProject().withRandomDetails().toApiPayload(),
    );

    // 2. UI: owner opens the project and closes it as "didn't go ahead"
    await projectDetailsPage.visit(created.id);
    await projectDetailsPage.closeJob({
      didGoAhead: false,
      reasons: ["budget", "quote_too_high"],
    });

    // 3. UI: archived projects are invisible — visiting the URL 404s
    await projectDetailsPage.assertNotVisibleToOwner(created.id);
  });

  test("closing as 'went ahead' marks the job completed and surfaces a winner", async ({
    request,
    runtime,
    projectApi,
    projectDetailsPage,
    homeownerProjectsPage,
  }) => {
    const location = "E4";

    // 1. API: owner creates a project
    const created = await projectApi.createProject(
      Project.aProject()
        .withRandomDetails({ locationQuery: location, locationPick: location })
        .toApiPayload(),
    );

    // 2. API: a separate homeowner becomes the recommender + posts a rec
    //    so the close flow's tradesperson picker has an entry to select.
    const recommender = await createHomeownerAccount({
      request,
      apiBaseUrl: runtime.apiBaseUrl,
      location,
      emailPrefix: "recommender",
    });
    const recApi = new RecommendationApi(recommender.client);
    await recApi.createRecommendation(
      created.id,
      Recommendation.aRecommendation().withRandomDetails().toPayload(),
    );

    // 3. UI: owner opens the project and closes as "went ahead" with the
    //    first available tradesperson selected
    await projectDetailsPage.visit(created.id);
    await projectDetailsPage.closeJob({
      didGoAhead: true,
      selectFirstTradesperson: true,
    });

    // 4. UI: project is now Completed and remains visible to the owner
    await projectDetailsPage.assertProjectIsCompleted(created.id);

    // 5. UI: completed project shows up under the Completed tab on /projects
    await homeownerProjectsPage.gotoTab("completed");
    await homeownerProjectsPage.hasCompletedCard(created.id);
  });
});
