import { test } from "../../../src/ui.fixtures";
import Account from "../../../src/models/Account";

const IS_CI = !!process.env.CI || !!process.env.DOCKER;

test.describe("Register via Google (real popup)", () => {
  // The real popup flow drives the Firebase emulator's IDP widget in a
  // separate browser window. This is inherently flaky under Docker/CI
  // load (popup close race). The simulated test in google-signin.spec.ts
  // covers the same post-OAuth flow without popup choreography.
  test.skip(IS_CI, "real popup tests are unreliable in CI");

  test("clicks Continue with Google, drives the emulator popup, and finishes signup", async ({
    registerPage,
    signupCompletePage,
    homeownerProjectsPage,
  }) => {
    const account = Account.aNewOAuthAccount("google");

    await registerPage.goto();
    await registerPage.signInAsNewOAuthAccount("google", account);
    await signupCompletePage.expectVisible();
    await signupCompletePage.completeAndExpectRedirect({ location: "E4" });
    await homeownerProjectsPage.expectVisible();
  });
});
