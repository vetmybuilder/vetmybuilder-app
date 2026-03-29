import { test, expect } from "../../../src/ui.fixtures";
import { seedUsers } from "../../../src/db/manage-db";
import { authedApiForUid } from "../../../src/api/services/client";
import TradesmanApi from "../../../src/apiHelper/tradesman/TradesmanApi";
import AdminApi from "../../../src/apiHelper/admin/AdminApi";
import Tradesman from "../../../src/models/tradesman";

const ADMIN_UID = process.env.TEST_ADMIN_USER_UID!;

test.describe("Admin tradesmen page", () => {
  test.beforeEach(async ({ runtime }) => {
    await seedUsers(runtime.dbName);
  });

  test("Non-admin user sees 'Admins only.' when visiting the page", async ({
    adminTradesmenPage,
  }) => {
    // The auto-login fixture signs in a regular test user.
    await adminTradesmenPage.visit();
    await expect(adminTradesmenPage.adminsOnlyError).toBeVisible();
  });

  test("Admin can visit the page and see the heading", async ({
    basePage,
    authHelper,
    adminTradesmenPage,
  }) => {
    await basePage.logout();
    await authHelper.loginAsUid(ADMIN_UID);

    await adminTradesmenPage.visit();
    await expect(adminTradesmenPage.heading).toBeVisible();
  });

  test("Admin sees 'No tradesmen.' when no registrations exist", async ({
    basePage,
    authHelper,
    adminTradesmenPage,
  }) => {
    await basePage.logout();
    await authHelper.loginAsUid(ADMIN_UID);

    await adminTradesmenPage.visit();
    await expect(adminTradesmenPage.emptyMessage).toBeVisible();
  });

  test("Admin can see a newly registered (draft) tradesman in the list", async ({
    request,
    runtime,
    basePage,
    authHelper,
    adminTradesmenPage,
  }) => {
    const companyName = `Listed Co ${Date.now()}`;
    const tradesman = Tradesman.aTradesman()
      .withRandomDetails()
      .withCompanyName(companyName);

    const tradesmanApi = new TradesmanApi(request, runtime.apiBaseUrl);
    const leadId = await tradesmanApi.join(tradesman);

    await basePage.logout();
    await authHelper.loginAsUid(ADMIN_UID);
    await adminTradesmenPage.visit();

    await adminTradesmenPage.assertRowVisible(leadId);
    await adminTradesmenPage.assertStatus(leadId, "draft");
  });

  test("Admin can search by company name and find the matching tradesman", async ({
    request,
    runtime,
    basePage,
    authHelper,
    adminTradesmenPage,
  }) => {
    const unique = `SearchTarget_${Date.now()}`;
    const tradesman = Tradesman.aTradesman()
      .withRandomDetails()
      .withCompanyName(unique);

    const tradesmanApi = new TradesmanApi(request, runtime.apiBaseUrl);
    const leadId = await tradesmanApi.join(tradesman);

    // Also register a second tradesman that should NOT appear
    await tradesmanApi.join(
      Tradesman.aTradesman()
        .withRandomDetails()
        .withCompanyName(`Other Co ${Date.now()}`),
    );

    await basePage.logout();
    await authHelper.loginAsUid(ADMIN_UID);
    await adminTradesmenPage.visit();

    await adminTradesmenPage.searchFor(unique);

    await adminTradesmenPage.assertRowVisible(leadId);
    // The second tradesman should not appear
    await expect(adminTradesmenPage.emptyMessage).not.toBeVisible();
    await expect(
      adminTradesmenPage.page.getByText("Other Co"),
    ).not.toBeVisible();
  });

  test("Admin can filter by status=draft to see only draft tradesmen", async ({
    request,
    runtime,
    basePage,
    authHelper,
    adminTradesmenPage,
  }) => {
    const tradesman = Tradesman.aTradesman()
      .withRandomDetails()
      .withCompanyName(`Filter Draft Co ${Date.now()}`);

    const tradesmanApi = new TradesmanApi(request, runtime.apiBaseUrl);
    const leadId = await tradesmanApi.join(tradesman);

    await basePage.logout();
    await authHelper.loginAsUid(ADMIN_UID);
    await adminTradesmenPage.visit();

    await adminTradesmenPage.filterByStatus("draft");

    await adminTradesmenPage.assertRowVisible(leadId);
    await adminTradesmenPage.assertStatus(leadId, "draft");
  });

  test("Admin can make a draft tradesman inactive", async ({
    request,
    runtime,
    basePage,
    authHelper,
    adminTradesmenPage,
  }) => {
    const tradesman = Tradesman.aTradesman()
      .withRandomDetails()
      .withCompanyName(`Inactive Co ${Date.now()}`);

    const tradesmanApi = new TradesmanApi(request, runtime.apiBaseUrl);
    const leadId = await tradesmanApi.join(tradesman);

    await basePage.logout();
    await authHelper.loginAsUid(ADMIN_UID);
    await adminTradesmenPage.visit();

    await adminTradesmenPage.assertRowVisible(leadId);
    await adminTradesmenPage.assertStatus(leadId, "draft");

    await adminTradesmenPage.makeInactive(leadId);
    await adminTradesmenPage.assertStatus(leadId, "inactive");
  });

  test("Admin can reset an inactive tradesman back to draft", async ({
    request,
    runtime,
    basePage,
    authHelper,
    adminTradesmenPage,
  }) => {
    const tradesman = Tradesman.aTradesman()
      .withRandomDetails()
      .withCompanyName(`Reset Draft Co ${Date.now()}`);

    const tradesmanApi = new TradesmanApi(request, runtime.apiBaseUrl);
    const leadId = await tradesmanApi.join(tradesman);

    // Set inactive via API to avoid extra UI steps
    const adminClient = await authedApiForUid(
      request,
      runtime.apiBaseUrl,
      ADMIN_UID,
    );
    const adminApi = new AdminApi(adminClient);
    await adminApi.setTradesmanStatus(leadId, "inactive");

    await basePage.logout();
    await authHelper.loginAsUid(ADMIN_UID);
    await adminTradesmenPage.visit();

    await adminTradesmenPage.assertRowVisible(leadId);
    await adminTradesmenPage.assertStatus(leadId, "inactive");

    await adminTradesmenPage.makeDraft(leadId);
    await adminTradesmenPage.assertStatus(leadId, "draft");
  });

  test("Filtering by status=active returns no results when all tradesmen are in draft", async ({
    request,
    runtime,
    basePage,
    authHelper,
    adminTradesmenPage,
  }) => {
    const unique = `Active Filter Co ${Date.now()}`;
    const tradesman = Tradesman.aTradesman()
      .withRandomDetails()
      .withCompanyName(unique);

    const tradesmanApi = new TradesmanApi(request, runtime.apiBaseUrl);
    await tradesmanApi.join(tradesman);

    await basePage.logout();
    await authHelper.loginAsUid(ADMIN_UID);
    await adminTradesmenPage.visit();

    await adminTradesmenPage.filterByStatus("active");
    await adminTradesmenPage.searchFor(unique);

    await expect(adminTradesmenPage.emptyMessage).toBeVisible();
  });

  test("Admin can make an inactive tradesman active", async ({
    request,
    runtime,
    basePage,
    authHelper,
    adminTradesmenPage,
  }) => {
    // Create a real user so promotion (assignTo) will succeed
    const builderUid = `builder-${Date.now()}`;
    const builderClient = await authedApiForUid(
      request,
      runtime.apiBaseUrl,
      builderUid,
    );
    await builderClient.post("/api/auth/signup", {
      firstName: "Builder",
      lastName: "Active",
      location: "E1",
    });

    // Create a lead and promote it to the real UID
    const tradesman = Tradesman.aTradesman()
      .withRandomDetails()
      .withCompanyName(`Make Active Co ${Date.now()}`);
    const tradesmanApi = new TradesmanApi(request, runtime.apiBaseUrl);
    const leadId = await tradesmanApi.join(tradesman);

    const adminClient = await authedApiForUid(
      request,
      runtime.apiBaseUrl,
      ADMIN_UID,
    );
    const adminApi = new AdminApi(adminClient);
    await adminApi.setTradesmanStatus(leadId, "active", builderUid);

    // Set inactive so the Make active button is enabled
    await adminApi.setTradesmanStatus(builderUid, "inactive");

    await basePage.logout();
    await authHelper.loginAsUid(ADMIN_UID);
    await adminTradesmenPage.visit();

    await adminTradesmenPage.assertRowVisible(builderUid);
    await adminTradesmenPage.assertStatus(builderUid, "inactive");

    await adminTradesmenPage.makeActive(builderUid);
    await adminTradesmenPage.assertStatus(builderUid, "active");
  });

  test("Admin can see company name and email in the tradesmen table", async ({
    request,
    runtime,
    basePage,
    authHelper,
    adminTradesmenPage,
  }) => {
    const companyName = `Visible Co ${Date.now()}`;
    const email = `visible-${Date.now()}@example.com`;
    const tradesman = Tradesman.aTradesman()
      .withRandomDetails()
      .withCompanyName(companyName);
    tradesman.email = email;

    const tradesmanApi = new TradesmanApi(request, runtime.apiBaseUrl);
    const leadId = await tradesmanApi.join(tradesman);

    await basePage.logout();
    await authHelper.loginAsUid(ADMIN_UID);
    await adminTradesmenPage.visit();

    await adminTradesmenPage.assertRowVisible(leadId);
    await expect(
      adminTradesmenPage.page.getByText(companyName),
    ).toBeVisible();
    await expect(
      adminTradesmenPage.page.getByText(email),
    ).toBeVisible();
  });
});
