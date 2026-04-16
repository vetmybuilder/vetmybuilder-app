import { test, expect } from "../../../src/ui.fixtures";
import { seedUsers } from "../../../src/db/manage-db";
import { AuthApi } from "../../../src/apiHelper/auth/AuthApi";

const ADMIN_UID = process.env.TEST_ADMIN_USER_UID!;
const ADMIN_EMAIL = process.env.E2E_ADMIN_USER_EMAIL!;
const ADMIN_PASSWORD = process.env.E2E_ADMIN_USER_PASSWORD!;

test.describe("Admin user management", () => {
  // TODO: remove once per-worker admin UIDs are implemented (see TODO.md).
  test.describe.configure({ mode: "serial" });

  test.beforeEach(async ({ runtime, request }) => {
    await seedUsers(runtime.dbName);
    await AuthApi.ensureEmulatorUser(request, runtime.apiBaseUrl, ADMIN_UID, ADMIN_EMAIL, ADMIN_PASSWORD);
  });

  test("Non-admin sees access restricted", async ({
    adminUsersPage,
  }) => {
    await adminUsersPage.visit();
    await expect(adminUsersPage.forbiddenMessage).toBeVisible();
  });

  test("Admin can visit the page and see the user list", async ({
    basePage,
    authHelper,
    adminUsersPage,
  }) => {
    await basePage.logoutViaUrl();
    await authHelper.loginAsUid(ADMIN_UID);
    await adminUsersPage.visit();
    await adminUsersPage.waitUntilReady();
    await expect(adminUsersPage.userTable).toBeVisible();
  });

  test("Admin can create a homeowner", async ({
    basePage,
    authHelper,
    adminUsersPage,
  }) => {
    await basePage.logoutViaUrl();
    await authHelper.loginAsUid(ADMIN_UID);
    await adminUsersPage.visit();
    await adminUsersPage.waitUntilReady();

    const email = `ui-ho-${Date.now()}@test.com`;
    await adminUsersPage.createUser({
      email,
      password: "Passw0rd!",
      firstName: "UI",
      lastName: "Homeowner",
      location: "E4 6ST",
      role: "Homeowner",
    });

    await adminUsersPage.assertUserInTable(email);
  });

  test("Admin can create a tradesman", async ({
    basePage,
    authHelper,
    adminUsersPage,
  }) => {
    await basePage.logoutViaUrl();
    await authHelper.loginAsUid(ADMIN_UID);
    await adminUsersPage.visit();
    await adminUsersPage.waitUntilReady();

    const email = `ui-tm-${Date.now()}@test.com`;
    await adminUsersPage.createUser({
      email,
      password: "Passw0rd!",
      firstName: "UI",
      lastName: "Tradesman",
      role: "Tradesman",
      companyName: `UI Test Co ${Date.now()}`,
      tradeTypes: "Plumber",
      serviceAreas: "E4 6ST",
    });

    await adminUsersPage.assertUserInTable(email);
  });

  test("shows error when required fields are missing", async ({
    basePage,
    authHelper,
    adminUsersPage,
  }) => {
    await basePage.logoutViaUrl();
    await authHelper.loginAsUid(ADMIN_UID);
    await adminUsersPage.visit();
    await adminUsersPage.waitUntilReady();

    await adminUsersPage.openCreateModal();
    await adminUsersPage.modalEmail.fill("incomplete@test.com");
    await adminUsersPage.submitAndExpectError(
      "Email, password, first name, and last name are required.",
    );
  });

  test("shows error when email is already taken", async ({
    basePage,
    authHelper,
    adminUsersPage,
  }) => {
    await basePage.logoutViaUrl();
    await authHelper.loginAsUid(ADMIN_UID);
    await adminUsersPage.visit();
    await adminUsersPage.waitUntilReady();

    const email = `ui-dup-${Date.now()}@test.com`;
    await adminUsersPage.createUser({
      email,
      password: "Passw0rd!",
      firstName: "First",
      lastName: "User",
      role: "Homeowner",
    });

    await adminUsersPage.openCreateModal();
    await adminUsersPage.selectRole("Homeowner");
    await adminUsersPage.modalEmail.fill(email);
    await adminUsersPage.modalPassword.fill("Passw0rd!");
    await adminUsersPage.modalFirstName.fill("Duplicate");
    await adminUsersPage.modalLastName.fill("User");
    await adminUsersPage.submitAndExpectError("Email already in use.");
  });

  test("shows error when tradesman is missing company name", async ({
    basePage,
    authHelper,
    adminUsersPage,
  }) => {
    await basePage.logoutViaUrl();
    await authHelper.loginAsUid(ADMIN_UID);
    await adminUsersPage.visit();
    await adminUsersPage.waitUntilReady();

    await adminUsersPage.openCreateModal();
    await adminUsersPage.selectRole("Tradesman");
    await adminUsersPage.modalEmail.fill(`ui-nocompany-${Date.now()}@test.com`);
    await adminUsersPage.modalPassword.fill("Passw0rd!");
    await adminUsersPage.modalFirstName.fill("No");
    await adminUsersPage.modalLastName.fill("Company");
    await adminUsersPage.submitAndExpectError(
      "Company name is required for tradesmen.",
    );
  });

  test("Admin can delete a user", async ({
    basePage,
    authHelper,
    adminUsersPage,
  }) => {
    await basePage.logoutViaUrl();
    await authHelper.loginAsUid(ADMIN_UID);
    await adminUsersPage.visit();
    await adminUsersPage.waitUntilReady();

    const email = `ui-del-${Date.now()}@test.com`;
    await adminUsersPage.createUser({
      email,
      password: "Passw0rd!",
      firstName: "To",
      lastName: "Delete",
      role: "Homeowner",
    });

    await adminUsersPage.assertUserInTable(email);
    await adminUsersPage.deleteUser(email);
    await adminUsersPage.assertUserNotInTable(email);
  });
});
