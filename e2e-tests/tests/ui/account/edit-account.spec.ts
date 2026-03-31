import { test, expect } from "../../../src/ui.fixtures";
import Account from "../../../src/models/Account";
import { authedApiForUid } from "../../../src/api/services/client";

test.describe("Homeowner account", () => {
  test.setTimeout(180_000);
  test("can edit homeowner account profile", async ({ //passing
    accountApi,
    accountPage,
    homeownerProjectsPage,
    siteHeader,
  }) => {
    const original = Account.anAccount().withRandomDetails();

    await accountApi.createAccount(original.toApiPayload());
    await homeownerProjectsPage.goto();
    await siteHeader.assertInitials(original.initials);

    const updated = Account.anAccount().withRandomDetails();
    const { emailBefore } = await accountPage.editAccountDetails(siteHeader, {
      firstName: updated.firstName,
      lastName: updated.lastName,
      username: updated.username,
      location: updated.location,
    });

    await siteHeader.assertInitials(updated.initials);

    await accountPage.visit();
    await accountPage.hasAccountDetails({
      firstName: updated.firstName,
      lastName: updated.lastName,
      username: updated.username,
      location: updated.location,
      email: emailBefore,
    });

    await accountPage.visit();
    await accountPage.waitUntilReady();
    await accountPage.assertEmailDisabled();
    await accountPage.hasAccountDetails({
      firstName: updated.firstName,
      lastName: updated.lastName,
      email: emailBefore,
      username: updated.username,
      location: updated.location,
    });
  });

  test("shows validation errors when submitting blank account form", async ({ //passing
    accountApi,
    accountPage,
  }) => {
    const original = Account.anAccount().withRandomDetails();

    await accountApi.createAccount(original.toApiPayload());
    await accountPage.visit();
    // await accountPage.waitUntilReady();

    await accountPage.firstName.fill("");
    await accountPage.lastName.fill("");
    await accountPage.username.fill("");
    await accountPage.location.fill("");
    await accountPage.saveButton.click();

    await accountPage.hasAccountFieldErrors({
      firstName: "First name is required.",
      lastName: "Last name is required.",
      username: "Username is required.",
      location: "Postcode or city is required.",
    });
  });

  test("shows an error when username is already taken", async ({ //passing
    request,
    runtime,
    authHelper,
    homeownerProjectsPage,
    siteHeader,
    accountPage,
  }) => {
    const baseUrl = runtime.apiBaseUrl;
    const takenUsername = `taken_${Date.now()}`;

    const uid1 = `e2e-u1-${Date.now()}`;
    const uid2 = `e2e-u2-${Date.now()}`;

    const client1 = await authedApiForUid(request, baseUrl, uid1);
    const client2 = await authedApiForUid(request, baseUrl, uid2);

    await client1.post("/api/auth/signup", {  //TODO: put in helper
      firstName: "John",
      lastName: "Smith",
      username: takenUsername,
      location: "E4 6JH",
    });

    await client2.post("/api/auth/signup", {
      firstName: "Jane",
      lastName: "Doe",
      username: `user_${Date.now()}`,
      location: "SW1A 1AA",
    });

    await authHelper.loginAsUid(uid2);

    await homeownerProjectsPage.goto();
    await siteHeader.goToEditAccount();

    await accountPage.changeUsername(takenUsername);
    await expect(accountPage.errorAlert).toContainText(
      "That username is already taken.",
    );
  });
});
