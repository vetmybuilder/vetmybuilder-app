import { test } from "../../../src/ui.fixtures";

test.describe("Signup", () => {
  test("authenticated user with no firstName is bounced to /signup/complete from /projects", async ({
    authHelper,
    page,
    signupCompletePage,
  }) => {
    await authHelper.logout();
    await authHelper.loginAsUidWithoutProfile();
    await page.goto("/projects");
    await signupCompletePage.expectVisible();
  });
});
