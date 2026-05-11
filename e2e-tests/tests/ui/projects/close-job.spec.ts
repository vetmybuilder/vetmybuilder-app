import { test, expect, getWorkerUid } from "../../../src/ui.fixtures";
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

  // Covers the gap discovered in May 2026: a project whose only candidate
  // is a swipe-deck match (no recommendations, no shared profiles) used to
  // be unclosable because the close dropdown only sourced recs + shares.
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

    // Provision a tradesperson and seed a 'matched' swipe_interest row so
    // they show up under the new "Matched on VetMyBuilder" source in the
    // close-project picker.
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
    homeownerProjectsPage,
  }) => {
    const created = await projectApi.createProject(
      Project.aProject().withRandomDetails().toApiPayload(),
    );

    // No recs, no shares, no matches - off-platform hire path.
    await projectDetailsPage.visit(created.id);
    await projectDetailsPage.closeJob({
      didGoAhead: true,
      pickSomeoneElse: true,
    });

    await projectDetailsPage.assertProjectIsCompleted(created.id);

    // Confirm the off-platform hire still surfaces under Completed.
    await homeownerProjectsPage.gotoTab("completed");
    await homeownerProjectsPage.hasCompletedCard(created.id);
  });

  // ───────────────────────────────────────────────────────────────────
  // /projects/[id]/completed page coverage. The close flow above
  // verifies that a project's *status* flips correctly, but the
  // editorial /completed page is a separate render path - it surfaces
  // the winner panel (company name, view-profile link) or the
  // "Hired off-platform" card depending on who was credited.
  // ───────────────────────────────────────────────────────────────────

  test("/completed shows the winner panel after closing with a matched tradesperson", async ({
    page,
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

    const tradesmanCompany = `Completed Winner Co ${Date.now()}`;
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

    // Navigate to the editorial completed page and assert the winner
    // panel renders. The exact link target (publicId vs uid) varies, so
    // we assert on the visible name + a non-empty href.
    await page.goto(`/projects/${created.id}/completed`);
    await expect(page.getByTestId("completed-gallery-page")).toBeVisible();
    await expect(page.getByTestId("completed-gallery-title")).toContainText(
      // project title is randomised, just confirm the heading renders
      /.+/,
    );

    const winnerPanel = page.getByTestId("completed-winner-panel");
    await expect(winnerPanel).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("completed-winner-name")).toHaveText(
      tradesmanCompany,
    );

    const viewProfile = page.getByTestId("completed-winner-view-profile");
    await expect(viewProfile).toBeVisible();
    await expect(viewProfile).toHaveAttribute("href", /\/tradesman\/.+/);

    // Off-platform card must NOT render for an on-platform winner.
    await expect(page.getByTestId("winner-offplatform")).toHaveCount(0);
  });

  test("/completed shows hired off-platform after closing via 'Someone else'", async ({
    page,
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

    await page.goto(`/projects/${created.id}/completed`);
    await expect(page.getByTestId("completed-gallery-page")).toBeVisible();

    const offPlatform = page.getByTestId("winner-offplatform");
    await expect(offPlatform).toBeVisible({ timeout: 15_000 });
    await expect(offPlatform).toContainText(/Hired off-platform/i);

    // No winner panel should render when nobody specific was credited.
    await expect(page.getByTestId("completed-winner-panel")).toHaveCount(0);
  });
});
