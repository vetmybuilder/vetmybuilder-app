import { test, expect } from "../../../src/ui.base.fixtures";
import Account from "../../../src/models/Account";

test.describe("Homeowner registration", () => {
  test("can register a new homeowner and lands on projects with correct initials badge, safety and verification card visible and filters are present", async ({
    homePage,
    registerPage,
    siteHeader,
    homeownerProjectsPage,
  }) => {
    const account = Account.anAccount().withRandomRegistration({
      location: "E4",
    });

    await homePage.goto();
    await registerPage.signUp(account);

    await homeownerProjectsPage.assertSafetyVerificationCardVisible();
    await homeownerProjectsPage.assertFiltersVisible();

    await expect(siteHeader.initialsBadge(account.initials)).toBeVisible({
      timeout: 15_000,
    });
  });
});
