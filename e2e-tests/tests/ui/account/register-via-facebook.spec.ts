import { test } from "../../../src/ui.fixtures";
import Account from "../../../src/models/Account";

const FACEBOOK_ENABLED = process.env.NEXT_PUBLIC_FACEBOOK_LOGIN === "1";

test.describe("Register via Facebook (real popup)", () => {
  // Skip when the Facebook feature flag is off — the button won't render.
  test.skip(!FACEBOOK_ENABLED, "NEXT_PUBLIC_FACEBOOK_LOGIN not enabled");

  test("clicks Continue with Facebook, drives the emulator popup, and finishes signup", async ({
    registerPage,
    signupCompletePage,
    homeownerProjectsPage,
  }) => {
    const account = Account.aNewOAuthAccount("facebook");

    await registerPage.goto();
    await registerPage.signInAsNewOAuthAccount("facebook", account);
    await signupCompletePage.expectVisible();
    await signupCompletePage.completeAndExpectRedirect({ location: "E4" });
    await homeownerProjectsPage.expectVisible();
  });
});
