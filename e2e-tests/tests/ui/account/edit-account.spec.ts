import { test, expect } from "../../../src/ui.fixtures";
import Account from "../../../src/models/Account";
import { authedApiForUid } from "../../../src/api/services/client";

test.describe("Homeowner account", () => {
  test.setTimeout(180_000);
  test("can edit homeowner account profile", async ({
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
    const { emailBefore, usernameBefore } = await accountPage.editAccountDetails(siteHeader, {
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
      username: usernameBefore,
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
      username: usernameBefore,
      location: updated.location,
    });
  });

  test("shows validation errors when submitting blank account form", async ({
    accountApi,
    accountPage,
  }) => {
    const original = Account.anAccount().withRandomDetails();

    await accountApi.createAccount(original.toApiPayload());
    await accountPage.visit();
    await accountPage.firstName.fill("");
    await accountPage.lastName.fill("");
    // username is read-only — cannot be cleared
    await accountPage.location.fill("");
    await accountPage.saveButton.click();

    await accountPage.hasAccountFieldErrors({
      firstName: "First name is required.",
      lastName: "Last name is required.",
      location: "Postcode or city is required.",
    });
  });
});
