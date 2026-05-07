import { test, expect } from "../../../src/ui.fixtures";
import { createAuthUser } from "../../../src/helpers/FirebaseSeed";
import { seedUsers } from "../../../src/db/manage-db";
import { authedApiForUid } from "../../../src/api/services/client";
import { AuthApi } from "../../../src/apiHelper/auth/AuthApi";
import Account from "../../../src/models/Account";
import Project from "../../../src/models/Project";
import Recommendation from "../../../src/models/Recommendation";
import { ProjectApi } from "../../../src/apiHelper/project/ProjectApi";
import { RecommendationApi } from "../../../src/apiHelper/project/ProjectRecommendationApi";

const ADMIN_UID = process.env.TEST_ADMIN_USER_UID!;

test.describe("Admin recommendation leaderboard", () => {
  // All tests in this file share the same TEST_ADMIN_USER_UID and seed the
  // admin row in beforeEach. Running them in parallel across workers races
  // against the shared Firebase emulator state and the per-test reseed,
  // surfacing as intermittent leaderboard data leaks. Serial mode keeps
  // the file pinned to a single worker.
  test.describe.configure({ mode: "serial" });

  test.beforeEach(async ({ runtime }) => {
    await seedUsers(runtime.dbName);
  });

  test("Non-admin user sees 'Access restricted' when visiting the page", async ({
    adminRecommendationLeaderboardPage,
  }) => {
    // The auto-login fixture signs in a regular test user (role='user').
    await adminRecommendationLeaderboardPage.visit();
    await expect(adminRecommendationLeaderboardPage.forbiddenMessage).toBeVisible({
      timeout: 30_000,
    });
  });

  test("Admin can visit the page and see the heading", async ({
    basePage,
    authHelper,
    adminRecommendationLeaderboardPage,
  }) => {
    await basePage.logoutViaUrl();
    await authHelper.loginAsUid(ADMIN_UID);

    await adminRecommendationLeaderboardPage.visit();
    await expect(adminRecommendationLeaderboardPage.heading).toBeVisible({
      timeout: 30_000,
    });
  });

  test("Admin sees 'No results.' when no recommendations exist", async ({
    basePage,
    authHelper,
    adminRecommendationLeaderboardPage,
  }) => {
    await basePage.logoutViaUrl();
    await authHelper.loginAsUid(ADMIN_UID);

    await adminRecommendationLeaderboardPage.visit();
    await adminRecommendationLeaderboardPage.waitUntilReady();

    await expect(adminRecommendationLeaderboardPage.emptyMessage).toBeVisible();
  });

  test("Admin can find a recommendation by contact name", async ({
    request,
    runtime,
    basePage,
    authHelper,
    adminRecommendationLeaderboardPage,
  }) => {
    // Create a homeowner with a live project
    const email = `owner+${Date.now()}@test.com`;
    const password = "Passw0rd!";

    const ownerAuthUser = await createAuthUser(email, password);
    const ownerClient = await authedApiForUid(
      request,
      runtime.apiBaseUrl,
      ownerAuthUser.uid,
    );
    await AuthApi.signup(
      ownerClient,
      Account.anAccount().withRandomDetails().withEmail(email).withPassword(password),
    );

    const projectApi = new ProjectApi(ownerClient);
    const project = await projectApi.createProject(
      Project.aProject().withRandomDetails().toApiPayload(),
      { publish: true },
    );

    // The leaderboard filter checks both company name and contact name.
    // Company name can be rewritten by the async CH verification job before the
    // leaderboard loads. Contact name (recommendations.name) is stored verbatim
    // and is safe to use as the search target.
    const contactName = `E2E Contact ${Date.now()}`;
    const rec = Recommendation.aRecommendation().withRandomDetails();
    rec.name = contactName;

    await new RecommendationApi(ownerClient).createRecommendation(
      project.id,
      rec.toPayload(),
    );

    await basePage.logoutViaUrl();
    await authHelper.loginAsUid(ADMIN_UID);
    await adminRecommendationLeaderboardPage.visit();
    await adminRecommendationLeaderboardPage.waitUntilReady();

    await adminRecommendationLeaderboardPage.searchFor(contactName);

    await adminRecommendationLeaderboardPage.assertShowsRecommendation(contactName);
    await expect(adminRecommendationLeaderboardPage.emptyMessage).not.toBeVisible();
  });

  test("Admin can clear the search and see all results", async ({
    request,
    runtime,
    basePage,
    authHelper,
    adminRecommendationLeaderboardPage,
  }) => {
    // Create a homeowner with a live project and a recommendation
    const email = `owner+${Date.now()}@test.com`;
    const password = "Passw0rd!";

    const ownerAuthUser = await createAuthUser(email, password);
    const ownerClient = await authedApiForUid(
      request,
      runtime.apiBaseUrl,
      ownerAuthUser.uid,
    );
    await AuthApi.signup(
      ownerClient,
      Account.anAccount().withRandomDetails().withEmail(email).withPassword(password),
    );

    const projectApi = new ProjectApi(ownerClient);
    const project = await projectApi.createProject(
      Project.aProject().withRandomDetails().toApiPayload(),
      { publish: true },
    );

    const contactName = `E2E Clear ${Date.now()}`;
    const rec = Recommendation.aRecommendation().withRandomDetails();
    rec.name = contactName;
    await new RecommendationApi(ownerClient).createRecommendation(
      project.id,
      rec.toPayload(),
    );

    await basePage.logoutViaUrl();
    await authHelper.loginAsUid(ADMIN_UID);
    await adminRecommendationLeaderboardPage.visit();
    await adminRecommendationLeaderboardPage.waitUntilReady();

    // Search narrows results to nothing
    await adminRecommendationLeaderboardPage.searchFor("zzz-no-match");
    await expect(adminRecommendationLeaderboardPage.emptyMessage).toBeVisible();

    // Clear restores all results — verify our record is back
    await adminRecommendationLeaderboardPage.clearSearch();
    await adminRecommendationLeaderboardPage.assertShowsRecommendation(contactName);
  });
});
