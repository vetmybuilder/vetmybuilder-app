import { test } from "../../../src/ui.fixtures";
import Account from "../../../src/models/Account";

const FACEBOOK_ENABLED = process.env.NEXT_PUBLIC_FACEBOOK_LOGIN === "1";

test.describe("Register via Facebook (real popup)", () => {
  // Skip when the Facebook feature flag is off — the button won't render.
  test.skip(!FACEBOOK_ENABLED, "NEXT_PUBLIC_FACEBOOK_LOGIN not enabled");

  test("clicks Continue with Facebook, drives the emulator popup, and lands on /projects", async ({
    registerPage,
    homeownerProjectsPage,
  }) => {
    const account = Account.aNewOAuthAccount("facebook");

    await registerPage.goto();
    await registerPage.signInAsNewOAuthAccount("facebook", account);
    // Postcode is no longer captured at signup, so the OAuth user lands
    // directly on /projects without a /signup/complete detour.
    await homeownerProjectsPage.expectVisible();
  });
});
