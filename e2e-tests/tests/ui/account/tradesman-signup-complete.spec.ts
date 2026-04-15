import { test, expect } from "../../../src/ui.fixtures";
import { mockPostcodesIo } from "../../../src/helpers/PostcodesIoMock";

test.describe("Tradesman SSO onboarding — /tradesman/signup/complete", () => {
  test("an authenticated no-profile user can walk the wizard and land on /tradesman/projects", async ({
    page,
    authHelper,
    tradesmanSignupCompletePage,
  }) => {
    await authHelper.logout();
    await authHelper.loginAsUidWithoutProfile();
    await mockPostcodesIo(page);

    await page.goto("/tradesman/signup/complete");
    await tradesmanSignupCompletePage.expectVisible();

    // Step 1 — company & contact. The email field is prefilled from
    await tradesmanSignupCompletePage.fillStep1({
      companyName: `SSO Trades Co ${Date.now()}`,
      contactName: "SSO Contact",
    });
    await tradesmanSignupCompletePage.addServiceArea("SW1A 1AA");
    await tradesmanSignupCompletePage.goToStep2();
    // Step 2 — at least one trade type.
    await tradesmanSignupCompletePage.selectTrade("Electrician");
    await tradesmanSignupCompletePage.goToStep3();
    // Step 3 — offers & documents. Everything on this step is optional,
    await tradesmanSignupCompletePage.submitStep3();
    await page.waitForURL(/\/tradesman\/projects/, { timeout: 20_000 });
    await expect(page.getByTestId("tradesman-projects-page")).toBeVisible({
      timeout: 15_000,
    });
  });

  test("oauth intent=tradesman on /login routes a no-profile user to the tradesman completion page", async ({
    page,
    authHelper,
    tradesmanSignupCompletePage,
  }) => {
    await authHelper.logout();
    await authHelper.loginAsUidWithoutProfile();
    await mockPostcodesIo(page);
    await page.goto("/login?next=/tradesman/projects");
    await page.evaluate(() => {
      sessionStorage.setItem("vmb:oauthIntent", "tradesman");
    });
    await page.reload();
    await tradesmanSignupCompletePage.expectVisible();
  });
});
