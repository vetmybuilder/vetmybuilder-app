import { test, expect } from "../../../src/ui.fixtures";
import Project from "../../../src/models/Project";
import Recommendation from "../../../src/models/Recommendation";
import Tradesman from "../../../src/models/tradesman";
import Account from "../../../src/models/Account";
import { createAuthUser } from "../../../src/helpers/FirebaseSeed";
import { authedApiForUid } from "../../../src/api/services/client";
import { AuthApi } from "../../../src/apiHelper/auth/AuthApi";

test.describe("Projects list tabs", () => {
  // Close via API (not UI modal) to avoid slowMo overhead exhausting the 60s test timeout.
  test("closed project (didGoAhead: false) appears in the archived tab", async ({
    apiClient,
    homeownerProjectsPage,
  }) => {
    const res = await apiClient.post(
      "/api/projects",
      Project.aProject().withRandomDetails().toApiPayload(),
    );
    expect(res.status()).toBe(201);
    const { project } = await res.json();

    const closeRes = await apiClient.post(`/api/projects/${project.id}/close`, {
      didGoAhead: false,
      reasons: ["budget"],
    });
    expect(closeRes.status()).toBe(200);

    await homeownerProjectsPage.page.goto("/projects?tab=archived");
    await homeownerProjectsPage.hasStatus(project.id, /archived/i);
  });

  test("completed project (didGoAhead: true) appears in the completed tab", async ({
    apiClient,
    homeownerProjectsPage,
  }) => {
    const res = await apiClient.post(
      "/api/projects",
      Project.aProject().withRandomDetails().toApiPayload(),
    );
    expect(res.status()).toBe(201);
    const { project } = await res.json();

    // Seed a recommendation so there is a winner to select
    const recRes = await apiClient.post(
      `/api/projects/${project.id}/recommendations`,
      Recommendation.aRecommendation().toPayload(),
    );
    expect(recRes.status()).toBe(201);
    const recBody = await recRes.json();

    const closeRes = await apiClient.post(`/api/projects/${project.id}/close`, {
      didGoAhead: true,
      winnerRecommendationId: recBody.recommendationId,
      wouldUseAgain: true,
      reasons: [],
    });
    expect(closeRes.status()).toBe(200);

    await homeownerProjectsPage.page.goto("/projects?tab=completed");
    await homeownerProjectsPage.hasCompletedCard(project.id);
  });

  test("neighbour sees a completed project in the community tab", async ({
    request,
    runtime,
    apiClient,
    loginPage,
    homeownerProjectsPage,
  }) => {
    // Create and complete a project as the homeowner (test worker).
    // Default location is "E4 0BQ" which will fuzzy-match a neighbour in "E4".
    const res = await apiClient.post(
      "/api/projects",
      Project.aProject().withRandomDetails().toApiPayload(),
    );
    expect(res.status()).toBe(201);
    const { project } = await res.json();

    const recRes = await apiClient.post(
      `/api/projects/${project.id}/recommendations`,
      Recommendation.aRecommendation().toPayload(),
    );
    expect(recRes.status()).toBe(201);
    const { recommendationId } = await recRes.json();

    const closeRes = await apiClient.post(`/api/projects/${project.id}/close`, {
      didGoAhead: true,
      winnerRecommendationId: recommendationId,
      wouldUseAgain: true,
      reasons: [],
    });
    expect(closeRes.status()).toBe(200);

    // Create a neighbour in the same area. The server uses locationRaw for matching,
    // so "E4" will fuzzy-match the project's stored location "E4 0BQ".
    const neighbour = Account.anAccount()
      .withRandomDetails()
      .withLocation("E4")
      .withEmail(`neighbour+${Date.now()}@test.com`)
      .withPassword("Passw0rd!");

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

    // Log in as neighbour via the UI and wait for the post-login redirect
    // before navigating to the community tab.
    await loginPage.loginExpectSuccess(neighbour.email!, neighbour.password!);

    await homeownerProjectsPage.gotoTab("completedCommunity");
    await homeownerProjectsPage.hasCompletedCard(project.id);
  });

  test("clicking the builder name on a community completed card navigates to /tradesman/[uid]", async ({
    request,
    runtime,
    apiClient,
    loginPage,
    homeownerProjectsPage,
  }) => {
    // Register a tradesman so their company name resolves to a UID
    const companyName = `Community Builder ${Date.now()}`;
    const tradesmanUid = `e2e-tm-${Date.now()}`;
    const tradesmanClient = await authedApiForUid(
      request,
      runtime.apiBaseUrl,
      tradesmanUid,
    );
    await tradesmanClient.put(
      "/api/tradesmen/me",
      Tradesman.aTradesman().withRandomDetails().withCompanyName(companyName).toPayload(),
    );

    // Create and complete a project as the homeowner with that tradesman as winner
    const projectRes = await apiClient.post(
      "/api/projects",
      Project.aProject().withRandomDetails().toApiPayload(),
    );
    expect(projectRes.status()).toBe(201);
    const { project } = await projectRes.json();

    const recRes = await apiClient.post(
      `/api/projects/${project.id}/recommendations`,
      Recommendation.aRecommendation().withRandomDetails().withCompany(companyName).toPayload(),
    );
    expect(recRes.status()).toBe(201);
    const { recommendationId } = await recRes.json();

    const closeRes = await apiClient.post(`/api/projects/${project.id}/close`, {
      didGoAhead: true,
      winnerRecommendationId: recommendationId,
      winnerTradesmanUid: tradesmanUid,
      wouldUseAgain: true,
    });
    expect(closeRes.status()).toBe(200);

    // Log in as a neighbour in the same area to see the community tab
    const neighbour = Account.anAccount()
      .withRandomDetails()
      .withLocation("E4")
      .withEmail(`builder-link-neighbour+${Date.now()}@test.com`)
      .withPassword("Passw0rd!");

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

    await homeownerProjectsPage.gotoTab("completedCommunity");
    await homeownerProjectsPage.hasCompletedCard(project.id);

    await homeownerProjectsPage.clickBuilderLink(project.id);
    await homeownerProjectsPage.hasNavigatedToTradesmanProfile(tradesmanUid);
  });
});
