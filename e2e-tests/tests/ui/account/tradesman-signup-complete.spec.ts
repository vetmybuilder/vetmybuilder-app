import { test, expect } from "../../../src/ui.fixtures";
import { mockPostcodesIo } from "../../../src/helpers/PostcodesIoMock";

/**
 * The real Google popup can't be driven from Playwright, but we can simulate
 * the post-OAuth state: a Firebase-authenticated user with no tradesmen row
 * in MySQL, having declared `intent=tradesman` via the OAuth button.
 *
 * Covers:
 *   1. The multi-step onboarding wizard saves a tradesman profile and
 *      redirects to /tradesman/projects.
 *   2. The `vmb:oauthIntent=tradesman` stash on /login routes a no-profile
 *      user straight to /tradesman/signup/complete instead of the homeowner
 *      completion page.
 */
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
    // Firebase and disabled, so we don't touch it here.
    await tradesmanSignupCompletePage.fillStep1({
      companyName: `SSO Trades Co ${Date.now()}`,
      contactName: "SSO Contact",
    });
    await tradesmanSignupCompletePage.addServiceArea("E4 0BQ");
    await tradesmanSignupCompletePage.goToStep2();

    // Step 2 — at least one trade type.
    await tradesmanSignupCompletePage.selectTrade("Electrician");
    await tradesmanSignupCompletePage.goToStep3();

    // Step 3 — offers & documents. Everything on this step is optional,
    // so submitting straight away exercises the minimum-happy-path.
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

    // Simulate what OAuthSignInButton does when pressed on the tradesman flow.
    await page.goto("/login?next=/tradesman/projects");
    await page.evaluate(() => {
      sessionStorage.setItem("vmb:oauthIntent", "tradesman");
    });

    // Force the login page's redirect useEffect to re-evaluate by
    // reloading. The auth context will rehydrate /api/me and read the
    // intent flag, routing to /tradesman/signup/complete.
    await page.reload();

    await tradesmanSignupCompletePage.expectVisible();
  });
});
