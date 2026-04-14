import { test, expect } from "../../../src/ui.fixtures";

/**
 * Regression guard: the Google SSO button must be rendered on the
 * homeowner AND tradesperson login flows. A previous refactor
 * accidentally gated the button behind `!isVendorFlow`, hiding it for
 * tradesmen — something no existing test caught because the popup-driven
 * signup tests call the Firebase emulator directly and never assert on
 * the button's visibility.
 *
 * Admin sign-in is password-only by design, so the button is NOT expected
 * there — that path isn't asserted here on purpose.
 */
test.describe("OAuth button visibility", () => {
  // The UI fixture auto-logs in, but these tests need an unauthenticated
  // session so the login/signup pages actually render instead of bouncing
  // the user to /projects.
  test.beforeEach(async ({ basePage }) => {
    await basePage.logoutViaUrl();
  });

  test("Google SSO button is visible on the homeowner login page", async ({
    page,
  }) => {
    await page.goto("/login");
    await expect(page.getByTestId("login-page")).toBeVisible();
    await expect(page.getByTestId("login-title")).toHaveText("Welcome back");
    await expect(page.getByTestId("google-signin-button")).toBeVisible();
  });

  test("Google SSO button is visible on the homeowner signup page", async ({
    page,
  }) => {
    await page.goto("/signup");
    await expect(page.getByTestId("google-signin-button")).toBeVisible();
  });

  test("Google SSO button is visible on the tradesperson login page", async ({
    page,
  }) => {
    // /tradesman/login redirects to /login?next=/tradesman/projects, which
    // renders the shared login page in vendor-flow mode.
    await page.goto("/tradesman/login");
    await expect(page.getByTestId("login-page")).toBeVisible();
    await expect(page.getByTestId("login-title")).toHaveText(
      "Tradesperson sign in",
    );
    await expect(page.getByTestId("google-signin-button")).toBeVisible();
  });
});
