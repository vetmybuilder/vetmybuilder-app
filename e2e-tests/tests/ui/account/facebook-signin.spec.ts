import { test, expect } from "../../../src/ui.fixtures";

/**
 * unable to drive a real Facebook popup/redirect from Playwright, but we can
 * simulate the post-OAuth state: a Firebase-authenticated user who has no
 * homeowner profile (no postcode) in MySQL. The auth context should detect
 * this and bounce them to /signup/complete on any homeowner-protected route.
 */
test.describe("Signup", () => {
  test("redirects an authenticated user with no profile to /signup/complete and finishes signup", async ({
    authHelper,
    page,
    signupCompletePage,
    homeownerProjectsPage,
  }) => {
    await authHelper.logout();
    await authHelper.loginAsUidWithoutProfile();
    await page.goto("/projects");
    await signupCompletePage.expectVisible();
    await signupCompletePage.completeAndExpectRedirect({
      location: "E4",
    });
    await homeownerProjectsPage.expectVisible();
  });

  test("shows validation error when submitted without a postcode", async ({
    authHelper,
    page,
    signupCompletePage,
  }) => {
    await authHelper.logout();
    await authHelper.loginAsUidWithoutProfile();

    await page.goto("/signup/complete");
    await signupCompletePage.expectVisible();
    await signupCompletePage.location.fill("");
    await signupCompletePage.submit();
    await expect(signupCompletePage.formError).toHaveText(
      "Please enter your postcode or city.",
    );
  });
});
