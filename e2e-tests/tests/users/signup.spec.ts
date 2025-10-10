import { test, expect } from "../../src/fixtures/base-fixture";
import User from "../../src/models/User";

test.describe("Signup", () => {
  test("is able to sign up", async ({
    homePage,
    loginPage,
    registerPage,
    projectsPage,
  }) => {
    const user = User.aUser()
      .withFirstName("Bobby")
      .withLastName("Brown")
      .withEmail(`e2e+${Date.now()}@example.com`)
      .withPostcode("E4")
      .withPassword("Passw0rd1");

    await homePage.goto();
    await homePage.signInButton.click();
    await loginPage.createOneLink.click();
    await registerPage.signUp(user.toJSON());
    await projectsPage.expectLoaded();

    await expect(projectsPage.accountInitials).toHaveText("BB");
  });
});
