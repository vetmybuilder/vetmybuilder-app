import { test } from "../../../src/ui.fixtures";
import Account from "../../../src/models/Account";

test.describe("Register via Google (real popup)", () => {
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
