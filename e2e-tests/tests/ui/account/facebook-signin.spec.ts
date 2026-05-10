import { test } from "../../../src/ui.fixtures";

/**
 * Can't drive a real Facebook popup/redirect from Playwright, but we can
 * simulate the post-OAuth state: a Firebase-authenticated user with no
 * homeowner profile in MySQL. Since postcode is no longer captured at
 * signup, the user lands directly on /projects - touchUserMw upserts the
 * row from the Firebase token claims on the first authed request, so
 * profile-complete flips true without any /signup/complete detour.
 */
test.describe("Signup", () => {
  test("an authenticated user with no profile lands on /projects without a /signup/complete detour", async ({
    authHelper,
    page,
    homeownerProjectsPage,
  }) => {
    await authHelper.logout();
    await authHelper.loginAsUidWithoutProfile();
    await page.goto("/projects");
    await homeownerProjectsPage.expectVisible();
  });
});
