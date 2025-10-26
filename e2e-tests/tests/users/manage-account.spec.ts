import { test, expect } from "../../src/fixtures/base-fixture";
import User from "../../src/models/User";

test.describe("Manage account", () => {
  test("can edit account details", async ({ homePage, accountPage }) => {
    const updated = {
      firstName: "Chris",
      lastName: "Morris",
      username: `chris.morris.${Date.now().toString(36).slice(-4)}`,
      location: "E3",
    };

    await homePage.clickEditAccount();
    await accountPage.waitForLoaded();
    await accountPage.fillAccountDetails(updated);
    await accountPage.hasSuccessMessage();
    await homePage.hasHeaderInitials("CM");
    await homePage.clickEditAccount();
    await accountPage.waitForLoaded();
    await accountPage.assertValues(updated);
  });

  test("shows error when username already exists", async ({
    usersApi,
    homePage,
    accountPage,
  }) => {
    const stamp = Date.now().toString(36).slice(-4);
    const takenUsername = `taken.user.${stamp}`;

    const seed = User.aUser()
      .withFirstName("Seed")
      .withLastName("User")
      .withEmail(`e2e+seed.${stamp}@example.com`)
      .withPostcode("E4")
      .withPassword("Passw0rd1")
      .withUsername(takenUsername);

    const { uid } = await usersApi.createUser(seed);
    expect(uid, "seed user creation failed").toBeTruthy();

    await homePage.clickEditAccount();
    await accountPage.waitForLoaded();
    const userInitialsBefore = await homePage.getHeaderInitials();

    await accountPage.fillAccountDetails({
      firstName: "Bobby",
      lastName: "Brown",
      username: takenUsername,
      location: "E4",
    });

    await accountPage.hasErrorMessage();
    await homePage.hasHeaderInitials(userInitialsBefore);
  });
});
