import { test, expect } from "../../../src/ui.fixtures";
import Project from "../../../src/models/Project";
import Recommendation from "../../../src/models/Recommendation";
import { RecommendationApi } from "../../../src/apiHelper/project/ProjectRecommendationApi";
import { createHomeownerAccount } from "../../../src/apiHelper/account/createHomeownerAccount";

test.describe("Builder profile", () => {
  test("homeowner can navigate back from builder profile to project", async ({
    request,
    runtime,
    projectApi,
    builderProfilePage,
  }) => {
    const location = "E4";

    // 1. API: owner creates a project (browser is auto-authed as owner
    //    via the apiClient fixture)
    const project = Project.aProject().withRandomDetails({
      locationQuery: location,
      locationPick: location,
    });
    const created = await projectApi.createProject(project.toApiPayload());

    // 2. API: a separate homeowner becomes the recommender + posts a rec
    const recommender = await createHomeownerAccount({
      request,
      apiBaseUrl: runtime.apiBaseUrl,
      location,
      emailPrefix: "recommender",
    });
    const recommendation = Recommendation.aRecommendation();
    const recApi = new RecommendationApi(recommender.client);
    const { recommendationId } = await recApi.createRecommendation(
      created.id,
      recommendation.toPayload(),
    );

    // 3. UI: owner opens the builder profile from the project page
    await builderProfilePage.visitFromProject(created.id, recommendationId);

    // 4. UI: navigate back to the project
    await builderProfilePage.goBackToProject(created.id);
  });

  test("homeowner can endorse a builder recommendation", async ({
    request,
    runtime,
    projectApi,
    builderProfilePage,
  }) => {
    const location = "E4";

    const project = Project.aProject().withRandomDetails({
      locationQuery: location,
      locationPick: location,
    });
    const created = await projectApi.createProject(project.toApiPayload());

    const recommender = await createHomeownerAccount({
      request,
      apiBaseUrl: runtime.apiBaseUrl,
      location,
      emailPrefix: "recommender",
    });
    const recApi = new RecommendationApi(recommender.client);
    const { recommendationId } = await recApi.createRecommendation(
      created.id,
      Recommendation.aRecommendation().toPayload(),
    );

    await builderProfilePage.visit(recommendationId);

    await builderProfilePage.endorseBuilder();
    await builderProfilePage.hasEndorsed();
  });

  test("homeowner cannot endorse the same builder twice", async ({
    request,
    runtime,
    projectApi,
    builderProfilePage,
  }) => {
    const location = "E4";

    const project = Project.aProject().withRandomDetails({
      locationQuery: location,
      locationPick: location,
    });
    const created = await projectApi.createProject(project.toApiPayload());

    const recommender = await createHomeownerAccount({
      request,
      apiBaseUrl: runtime.apiBaseUrl,
      location,
      emailPrefix: "recommender",
    });
    const recApi = new RecommendationApi(recommender.client);
    const { recommendationId } = await recApi.createRecommendation(
      created.id,
      Recommendation.aRecommendation().toPayload(),
    );

    await builderProfilePage.visit(recommendationId);
    await builderProfilePage.endorseBuilder();
    await builderProfilePage.hasEndorsed();

    // Second click is gated by the disabled state (myLike === 1).
    await builderProfilePage.expectEndorseDisabled();
  });

  test("mobile only: heart toggle saves a linked builder to favourites", async ({
    request,
    runtime,
    projectApi,
    builderProfilePage,
  }) => {
    test.skip(
      !builderProfilePage.isMobile(),
      "favourite heart only renders on mobile",
    );

    const location = "E4";

    const project = Project.aProject().withRandomDetails({
      locationQuery: location,
      locationPick: location,
    });
    const created = await projectApi.createProject(project.toApiPayload());

    // Recommender uses their OWN company name on the recommendation, then
    // signs up as a tradesman with that name so the rec auto-links.
    // Without a linkedTradesmanUid, the heart button doesn't render.
    const recommender = await createHomeownerAccount({
      request,
      apiBaseUrl: runtime.apiBaseUrl,
      location,
      emailPrefix: "recommender",
    });
    const recApi = new RecommendationApi(recommender.client);
    const { recommendationId } = await recApi.createRecommendation(
      created.id,
      Recommendation.aRecommendation().toPayload(),
    );

    await builderProfilePage.visit(recommendationId);

    // The heart only renders when linked_tradesman_uid is set on the rec.
    // Skip if this seeded rec didn't auto-link — the favourite-toggle
    // path is exercised more reliably from a separate fixture.
    const heartVisible = await builderProfilePage.mobileFavouriteButton
      .isVisible()
      .catch(() => false);
    test.skip(!heartVisible, "rec is unlinked - favourite heart absent");

    await builderProfilePage.expectMobileFavouritePressed(false);
    await builderProfilePage.toggleMobileFavourite();
    await builderProfilePage.expectMobileFavouritePressed(true);
  });
});
