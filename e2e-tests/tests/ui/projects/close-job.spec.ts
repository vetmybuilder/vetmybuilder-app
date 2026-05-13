import { test, getWorkerUid } from "../../../src/ui.fixtures";
import Project from "../../../src/models/Project";
import Recommendation from "../../../src/models/Recommendation";
import Tradesman from "../../../src/models/tradesman";
import { RecommendationApi } from "../../../src/apiHelper/project/ProjectRecommendationApi";
import { createHomeownerAccount } from "../../../src/apiHelper/account/createHomeownerAccount";
import { setupTradesmanProfile } from "../../../src/apiHelper/tradesman/setupTradesmanProfile";

test.describe("Close a job", () => {
  test("closing as 'didn't go ahead' archives the job and the owner can no longer see it", async ({
    projectApi,
    projectDetailsPage,
  }) => {
    const created = await projectApi.createProject(
      Project.aProject().withRandomDetails().toApiPayload(),
    );

    await projectDetailsPage.visit(created.id);
    await projectDetailsPage.closeJob({
      didGoAhead: false,
      reasons: ["budget", "quote_too_high"],
    });

    await projectDetailsPage.assertNotVisibleToOwner(created.id);
  });

  test("closing as 'went ahead' with an on-platform tradesperson removes the project from the owner's view", async ({
    request,
    runtime,
    projectApi,
    projectDetailsPage,
  }) => {
    const location = "E4";

    const created = await projectApi.createProject(
      Project.aProject()
        .withRandomDetails({ locationQuery: location, locationPick: location })
        .toApiPayload(),
    );

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

    await projectDetailsPage.visit(created.id);
    await projectDetailsPage.closeJob({
      didGoAhead: true,
      selectFirstTradesperson: true,
    });

    await projectDetailsPage.assertProjectIsCompleted(created.id);
  });

  test("can close as 'went ahead' when the only candidate is a matched tradesperson", async ({
    request,
    runtime,
    projectApi,
    projectDetailsPage,
    swipeMatchingApi,
  }, testInfo) => {
    const location = "E4";

    const created = await projectApi.createProject(
      Project.aProject()
        .withRandomDetails({ locationQuery: location, locationPick: location })
        .toApiPayload(),
    );

    const tradesmanCompany = `Matched Build Co ${Date.now()}`;
    const tradesman = Tradesman.aTradesman()
      .withRandomDetails()
      .withCompanyName(tradesmanCompany);
    const { uid: builderUid } = await setupTradesmanProfile({
      request,
      apiBaseUrl: runtime.apiBaseUrl,
      tradesman,
    });

    await swipeMatchingApi.seedMatchedSwipeInterest({
      projectId: Number(created.id),
      homeownerUid: getWorkerUid(testInfo.workerIndex),
      builderUid,
    });

    await projectDetailsPage.visit(created.id);
    await projectDetailsPage.closeJob({
      didGoAhead: true,
      tradespersonLabel: tradesmanCompany,
    });

    await projectDetailsPage.assertProjectIsCompleted(created.id);
  });

  test("can close as 'went ahead' via 'Someone else' when no candidates exist", async ({
    projectApi,
    projectDetailsPage,
  }) => {
    const created = await projectApi.createProject(
      Project.aProject().withRandomDetails().toApiPayload(),
    );

    await projectDetailsPage.visit(created.id);
    await projectDetailsPage.closeJob({
      didGoAhead: true,
      pickSomeoneElse: true,
    });

    await projectDetailsPage.assertProjectIsCompleted(created.id);
  });

  test("closing as 'went ahead' + Boost archives the project and records boost consent", async ({
    request,
    runtime,
    projectApi,
    projectDetailsPage,
    swipeMatchingApi,
  }, testInfo) => {
    const location = "E4";

    const created = await projectApi.createProject(
      Project.aProject()
        .withRandomDetails({ locationQuery: location, locationPick: location })
        .toApiPayload(),
    );

    const tradesmanCompany = `Boost Build Co ${Date.now()}`;
    const tradesman = Tradesman.aTradesman()
      .withRandomDetails()
      .withCompanyName(tradesmanCompany);
    const { uid: builderUid } = await setupTradesmanProfile({
      request,
      apiBaseUrl: runtime.apiBaseUrl,
      tradesman,
    });

    await swipeMatchingApi.seedMatchedSwipeInterest({
      projectId: Number(created.id),
      homeownerUid: getWorkerUid(testInfo.workerIndex),
      builderUid,
    });

    await projectDetailsPage.visit(created.id);
    await projectDetailsPage.closeJob({
      didGoAhead: true,
      tradespersonLabel: tradesmanCompany,
      satisfied: "yes",
      boost: true,
    });

    await projectDetailsPage.assertNotVisibleToOwner(created.id);
  });

  test("closing as 'went ahead' + satisfied=no archives the project without boosting", async ({
    request,
    runtime,
    projectApi,
    projectDetailsPage,
    swipeMatchingApi,
  }, testInfo) => {
    const location = "E4";

    const created = await projectApi.createProject(
      Project.aProject()
        .withRandomDetails({ locationQuery: location, locationPick: location })
        .toApiPayload(),
    );

    const tradesmanCompany = `Unsatisfied Build Co ${Date.now()}`;
    const tradesman = Tradesman.aTradesman()
      .withRandomDetails()
      .withCompanyName(tradesmanCompany);
    const { uid: builderUid } = await setupTradesmanProfile({
      request,
      apiBaseUrl: runtime.apiBaseUrl,
      tradesman,
    });

    await swipeMatchingApi.seedMatchedSwipeInterest({
      projectId: Number(created.id),
      homeownerUid: getWorkerUid(testInfo.workerIndex),
      builderUid,
    });

    await projectDetailsPage.visit(created.id);
    await projectDetailsPage.closeJob({
      didGoAhead: true,
      tradespersonLabel: tradesmanCompany,
      satisfied: "no",
    });

    // CR3: every closure archives the project, so this 404s for the
    // owner just like the boost path - the difference between the two
    // (boost consent + photo sharing) is captured in project_closures.
    await projectDetailsPage.assertNotVisibleToOwner(created.id);
  });
});
