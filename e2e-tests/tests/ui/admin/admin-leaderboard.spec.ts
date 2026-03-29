import { test, expect } from "../../../src/ui.fixtures";
import {
  createAuthUser,
  createAuthUserWithUid,
} from "../../../src/helpers/FirebaseSeed";
import { seedUsers } from "../../../src/db/manage-db";
import { authedApiForUid } from "../../../src/api/services/client";
import { AuthApi } from "../../../src/apiHelper/auth/AuthApi";
import Account from "../../../src/models/Account";
import Tradesman from "../../../src/models/tradesman";
import TradesmanApi from "../../../src/apiHelper/tradesman/TradesmanApi";
import AdminApi from "../../../src/apiHelper/admin/AdminApi";

const ADMIN_UID = process.env.TEST_ADMIN_USER_UID!;
const ADMIN_EMAIL = process.env.E2E_ADMIN_USER_EMAIL!;
const ADMIN_PASSWORD = process.env.E2E_ADMIN_USER_PASSWORD!;

test.describe("Admin leaderboard", () => {
  test.beforeEach(async ({ runtime }) => {
    // Seed admin and test users so the admin UID has role='admin' in user_roles.
    // This runs after wipeDatabase (which preserves user_roles) so the seeded
    // roles are available for the duration of each test.
    await seedUsers(runtime.dbName);
  });

  test("Non-admin user sees 'Access restricted' when visiting the leaderboard", async ({
    adminLeaderboardPage,
  }) => {
    // The auto-login fixture has signed in a regular test user (role='user').
    // The leaderboard route returns 403 for non-admins, triggering the forbidden UI.
    await adminLeaderboardPage.visit();
    await expect(adminLeaderboardPage.forbiddenMessage).toBeVisible();
  });

  test("Admin can sign in via /admin/login and reach the leaderboard", async ({
    basePage,
    loginPage,
    adminLoginPage,
    adminLeaderboardPage,
  }) => {
    // Ensure the admin Firebase user exists with the seeded UID so user_roles matches.
    await createAuthUserWithUid(ADMIN_UID, ADMIN_EMAIL, ADMIN_PASSWORD);

    await basePage.logout();

    await adminLoginPage.visit();
    await adminLoginPage.continueToLogin();

    await loginPage.loginWith(ADMIN_EMAIL, ADMIN_PASSWORD);

    await adminLeaderboardPage.waitUntilReady();
  });

  test("Admin can find a newly registered builder (draft) in the leaderboard", async ({
    request,
    runtime,
    basePage,
    authHelper,
    adminLeaderboardPage,
  }) => {
    const tradesman = Tradesman.aTradesman()
      .withRandomDetails()
      .withCompanyName(`Draft Co ${Date.now()}`);

    const tradesmanApi = new TradesmanApi(request, runtime.apiBaseUrl);
    const leadId = await tradesmanApi.join(tradesman);

    await basePage.logout();
    await authHelper.loginAsUid(ADMIN_UID);

    await adminLeaderboardPage.visit();
    await adminLeaderboardPage.searchFor(tradesman.companyName);

    await adminLeaderboardPage.assertRowVisible(leadId);
    await adminLeaderboardPage.hasStatus(leadId, "draft");
  });

  test("Admin can approve (make active) a builder registration", async ({
    request,
    runtime,
    basePage,
    authHelper,
    adminLeaderboardPage,
  }) => {
    const password = "Passw0rd!";
    const email = `builder+${Date.now()}@test.com`;

    // Create a real Firebase + DB user for the builder so the admin's
    // "Make active" action can auto-match by email and promote the lead.
    const builderAuthUser = await createAuthUser(email, password);
    const builderClient = await authedApiForUid(
      request,
      runtime.apiBaseUrl,
      builderAuthUser.uid,
    );
    const builder = Account.anAccount()
      .withRandomDetails()
      .withEmail(email)
      .withPassword(password);
    await AuthApi.signup(builderClient, builder);

    // Submit the builder registration as a lead (no Firebase auth required).
    const tradesman = Tradesman.aTradesman()
      .withRandomDetails()
      .withCompanyName(`Active Co ${Date.now()}`);
    tradesman.email = email;

    const tradesmanApi = new TradesmanApi(request, runtime.apiBaseUrl);
    const leadId = await tradesmanApi.join(tradesman);

    // Sign in as admin and open the leaderboard.
    await basePage.logout();
    await authHelper.loginAsUid(ADMIN_UID);
    await adminLeaderboardPage.visit();
    await adminLeaderboardPage.searchFor(tradesman.companyName);

    await adminLeaderboardPage.assertRowVisible(leadId);
    await adminLeaderboardPage.hasStatus(leadId, "draft");

    // Click "Make active" — server auto-matches by email and promotes the lead.
    await adminLeaderboardPage.setStatus(leadId, "active");

    // After promotion the real-UID row appears with status='active'.
    await adminLeaderboardPage.hasStatus(builderAuthUser.uid, "active");
  });

  test("Admin can deactivate an active builder", async ({
    request,
    runtime,
    basePage,
    authHelper,
    adminLeaderboardPage,
  }) => {
    const password = "Passw0rd!";
    const email = `builder+${Date.now()}@test.com`;

    const builderAuthUser = await createAuthUser(email, password);
    const builderClient = await authedApiForUid(
      request,
      runtime.apiBaseUrl,
      builderAuthUser.uid,
    );
    const builder = Account.anAccount()
      .withRandomDetails()
      .withEmail(email)
      .withPassword(password);
    await AuthApi.signup(builderClient, builder);

    const tradesman = Tradesman.aTradesman()
      .withRandomDetails()
      .withCompanyName(`Inactive Co ${Date.now()}`);
    tradesman.email = email;

    const tradesmanApi = new TradesmanApi(request, runtime.apiBaseUrl);
    const leadId = await tradesmanApi.join(tradesman);

    // Promote the builder to active via the API (bypass the UI for setup).
    const adminClient = await authedApiForUid(
      request,
      runtime.apiBaseUrl,
      ADMIN_UID,
    );
    const adminApi = new AdminApi(adminClient);
    await adminApi.setTradesmanStatus(leadId, "active", builderAuthUser.uid);

    // Sign in as admin, find the now-active builder, and deactivate them.
    await basePage.logout();
    await authHelper.loginAsUid(ADMIN_UID);
    await adminLeaderboardPage.visit();
    await adminLeaderboardPage.searchFor(tradesman.companyName);

    await adminLeaderboardPage.assertRowVisible(builderAuthUser.uid);
    await adminLeaderboardPage.hasStatus(builderAuthUser.uid, "active");

    await adminLeaderboardPage.setStatus(builderAuthUser.uid, "inactive");
    await adminLeaderboardPage.hasStatus(builderAuthUser.uid, "inactive");
  });
});
