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
    projectApi,
    projectDetailsPage,
  }) => {
    const created = await projectApi.createProject(
      Project.aProject().withRandomDetails().toApiPayload(),
    );

    await projectApi.closeProject(created.id, {
      didGoAhead: false,
      reasons: ["budget"],
    });

    await projectDetailsPage.visit(created.id);
    await projectDetailsPage.hasStatus("Archived");
    await projectDetailsPage.unarchive();
  });

  test("can close a project that didn't go ahead", async ({
    projectApi,
    projectDetailsPage,
  }) => {
    const created = await projectApi.createProject(
      Project.aProject().withRandomDetails().toApiPayload(),
    );

    await projectDetailsPage.visit(created.id);

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

    const created = await projectApi.createProject(
      Project.aProject()
        .withRandomDetails({ locationQuery: location, locationPick: location })
        .toApiPayload(),
    );
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

    await new RecommendationApi(neighbourClient).createRecommendation(
      created.id,
      Recommendation.aRecommendation().withRandomDetails().toPayload(),
    );

    await projectDetailsPage.visit(created.id);

    await projectDetailsPage.closeProject({
      didGoAhead: true,
      selectFirstTradesperson: true,
    });
    await projectDetailsPage.hasStatus("Completed");
  });
});
