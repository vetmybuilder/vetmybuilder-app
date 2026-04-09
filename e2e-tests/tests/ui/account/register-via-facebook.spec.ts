import { test } from "../../../src/ui.fixtures";
import Account from "../../../src/models/Account";

test.describe("Register via Facebook (real popup)", () => {
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
