import { test, expect } from "../../../src/ui.fixtures";
import Account from "../../../src/models/Account";
import { createAuthUser } from "../../../src/helpers/FirebaseSeed";
import { authedApiForUid } from "../../../src/api/services/client";
import { AuthApi } from "../../../src/apiHelper/auth/AuthApi";

test.describe("Sign in", () => {
  test("can sign in with valid credentials and lands on projects", async ({
    request,
    runtime,
    basePage,
    loginPage,
    homeownerProjectsPage,
  }) => {
    const password = "Passw0rd!";

    const user = Account.anAccount()
      .withRandomDetails()
      .withEmail(`signin+${Date.now()}@test.com`)
      .withPassword(password);

    const authUser = await createAuthUser(user.email!, user.password!);

    const client = await authedApiForUid(
      request,
      runtime.apiBaseUrl,
      authUser.uid,
    );

    await AuthApi.signup(client, user);

    await basePage.logoutViaUrl();
    await loginPage.loginExpectSuccess(user.email!, user.password!);
    await homeownerProjectsPage.expectVisible();
  });

  test("shows a friendly error when the password is wrong", async ({
    basePage,
    loginPage,
  }) => {
    await basePage.logoutViaUrl();
    await loginPage.login("test@test.com", "wrongpassword");
    await loginPage.hasErrorMessage("Incorrect email or password");
  });

  test("shows a friendly error when the email does not exist", async ({
    basePage,
    loginPage,
  }) => {
    await basePage.logoutViaUrl();
    await loginPage.login(`unknown+${Date.now()}@test.com`, "Passw0rd!");
    await loginPage.hasErrorMessage("Incorrect email or password");
  });

  test("redirects to the next path after signing in", async ({
    request,
    runtime,
    basePage,
    loginPage,
  }) => {
    const password = "Passw0rd!";

    const user = Account.anAccount()
      .withRandomDetails()
      .withEmail(`signin+${Date.now()}@test.com`)
      .withPassword(password);

    const authUser = await createAuthUser(user.email!, user.password!);

    const client = await authedApiForUid(
      request,
      runtime.apiBaseUrl,
      authUser.uid,
    );

    await AuthApi.signup(client, user);

    await basePage.logoutViaUrl();

    await loginPage.goto("/projects");
    await loginPage.loginWith(user.email!, user.password!);

    await loginPage.page.waitForURL("/projects", { timeout: 15_000 });
  });

  test("'create one' link navigates to the signup page", async ({
    loginPage,
  }) => {
    await loginPage.goto();
    await loginPage.clickCreateOneLink();
    await expect(loginPage.page).toHaveURL("/signup");
  });

  test("shows tradesman registration link when next points to a tradesman path", async ({
    loginPage,
  }) => {
    await loginPage.goto("/tradesman/projects");
    await loginPage.hasVendorSignupLink();
  });
});
