import { test, expect } from "../../../src/ui.fixtures";
import { createAuthUser } from "../../../src/helpers/FirebaseSeed";
import { seedUsers } from "../../../src/db/manage-db";
import { authedApiForUid } from "../../../src/api/services/client";
import { AuthApi } from "../../../src/apiHelper/auth/AuthApi";
import Account from "../../../src/models/Account";
import Tradesman from "../../../src/models/tradesman";

const ADMIN_UID = process.env.TEST_ADMIN_USER_UID!;
const ADMIN_EMAIL = process.env.E2E_ADMIN_USER_EMAIL!;
const ADMIN_PASSWORD = process.env.E2E_ADMIN_USER_PASSWORD!;

test.describe("Admin leaderboard", () => {
  test.beforeEach(async ({ runtime, request }) => {
    // Seed admin and test users so the admin UID has role='admin' in user_roles.
    await seedUsers(runtime.dbName);
    // Ensure the admin Firebase user exists in the emulator via the server endpoint.
    // Using ensureEmulatorUser (server-side) rather than the Admin SDK directly from
    // the test runner, because the server process is guaranteed to have
    // FIREBASE_AUTH_EMULATOR_HOST set correctly.
    await AuthApi.ensureEmulatorUser(request, runtime.apiBaseUrl, ADMIN_UID, ADMIN_EMAIL, ADMIN_PASSWORD);
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
    page,
    basePage,
    loginPage,
    adminLoginPage,
    adminLeaderboardPage,
  }) => {
    await basePage.logoutViaUrl();

    await adminLoginPage.visit();
    await adminLoginPage.continueToLogin();

    await loginPage.loginWith(ADMIN_EMAIL, ADMIN_PASSWORD);

    // After a successful admin login the ?next= param should redirect here.
    await expect(page).toHaveURL(/admin\/tradesmen-leaderboard/, {
      timeout: 20_000,
    });
    await expect(adminLeaderboardPage.heading).toBeVisible();
  });

  test("Admin can find a newly registered builder (draft) in the leaderboard", async ({
    basePage,
    authHelper,
    adminLeaderboardPage,
    tradesmanApi,
  }) => {
    const tradesman = Tradesman.aTradesman()
      .withRandomDetails()
      .withCompanyName(`Draft Co ${Date.now()}`);

    const leadId = await tradesmanApi.join(tradesman);

    await basePage.logoutViaUrl();
    await authHelper.loginAsUid(ADMIN_UID);

    await adminLeaderboardPage.visit();
    await adminLeaderboardPage.waitUntilReady();
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
    tradesmanApi,
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

    const leadId = await tradesmanApi.join(tradesman);

        await basePage.logoutViaUrl();
    await authHelper.loginAsUid(ADMIN_UID);
    await adminLeaderboardPage.visit();
    await adminLeaderboardPage.waitUntilReady();
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
    tradesmanApi,
    adminApi,
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

    const leadId = await tradesmanApi.join(tradesman);

    // Promote the builder to active via the API (bypass the UI for setup).
    await adminApi.setTradesmanStatus(leadId, "active", builderAuthUser.uid);

    // Sign in as admin, find the now-active builder, and deactivate them.
    await basePage.logoutViaUrl();
    await authHelper.loginAsUid(ADMIN_UID);
    await adminLeaderboardPage.visit();
    await adminLeaderboardPage.waitUntilReady();
    await adminLeaderboardPage.searchFor(tradesman.companyName);

    await adminLeaderboardPage.assertRowVisible(builderAuthUser.uid);
    await adminLeaderboardPage.hasStatus(builderAuthUser.uid, "active");

    await adminLeaderboardPage.setStatus(builderAuthUser.uid, "inactive");
    await adminLeaderboardPage.hasStatus(builderAuthUser.uid, "inactive");
  });
});
