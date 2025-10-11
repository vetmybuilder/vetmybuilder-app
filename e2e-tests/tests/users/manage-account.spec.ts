import { test, expect } from "../../src/fixtures/base-fixture";
import User from "../../src/models/User";

test.describe("Manage account", () => {
  test("can edit account details", async ({
    usersApi,
    loginAsUid,
    homePage,
    page,
    accountPage,
  }) => {
    const user = User.aUser()
      .withFirstName("Bobby")
      .withLastName("Brown")
      .withEmail(`e2e+${Date.now()}-b@example.com`)
      .withPostcode("E4")
      .withPassword("Passw0rd1");

    const { uid } = await usersApi.createUser(user);
    await loginAsUid(uid!, { redirect: "/projects" });

    const updated = {
      firstName: "Chris",
      lastName: "Morris",
      username: `chris.morris.${Date.now().toString(36).slice(-4)}`,
      location: "E3",
    };

    await homePage.clickEditAccount();
    await accountPage.fillAccountDetails(updated, {
      expectedEmail: user.email,
    });
    await accountPage.hasSuccessMessage();
    await expect(homePage.accountInitials).toHaveText("CM");
    await page.goto("/account");
    await accountPage.waitForLoaded();
    await accountPage.assertValues(updated);
  });

  test("shows error when username already exists", async ({
    usersApi,
    loginAsUid,
    homePage,
    page,
    accountPage,
  }) => {
    const stamp = Date.now().toString(36).slice(-4);
    const userAInitials = "BB";

    const userA = User.aUser()
      .withFirstName("Bobby")
      .withLastName("Brown")
      .withEmail(`e2e+${Date.now()}-a@example.com`)
      .withPostcode("E4")
      .withPassword("Passw0rd1")
      .withUsername(`bobby.brown.${stamp}`);

    const userB = User.aUser()
      .withFirstName("Chris")
      .withLastName("Morris")
      .withEmail(`e2e+${Date.now()}-b@example.com`)
      .withPostcode("E4")
      .withPassword("Passw0rd1")
      .withUsername(`chris.morris.${stamp}`);

    const { uid: uidA } = await usersApi.createUser(userA);
    const { uid: uidB } = await usersApi.createUser(userB);

    await loginAsUid(uidA!, { redirect: "/account" });
    await accountPage.waitForLoaded();
    await accountPage.fillAccountDetails(
      {
        firstName: "Bobby",
        lastName: "Brown",
        username: userB.username!,
        location: "E4",
      },
      { expectedEmail: userA.email! }
    );

    await accountPage.hasErrorMessage();
    await expect(homePage.accountInitials).toHaveText(userAInitials);
    await page.goto("/account");
    await accountPage.waitForLoaded();
    await accountPage.assertValues({
      firstName: "Bobby",
      lastName: "Brown",
      username: userA.username!,
      location: "E4",
    });
    await expect(homePage.accountInitials).toHaveText(userAInitials);
  });
});
