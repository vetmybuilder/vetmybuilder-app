import { test } from "../../../src/ui.fixtures";

test.describe("Dual-role account prevention", () => {
  test("blocks an existing homeowner from registering as a tradesperson via SSO", async ({
    authHelper,
    tradesmanSignupCompletePage,
  }) => {
    await authHelper.loginAsHomeowner({
      firstName: "DualRole",
      lastName: "Blocker",
      location: "E4",
    });

    await tradesmanSignupCompletePage.page.goto("/tradesman/signup/complete");
    await tradesmanSignupCompletePage.expectBlockedAsExistingHomeowner();
  });

  test("allows a fresh user with no homeowner profile to proceed", async ({
    authHelper,
    tradesmanSignupCompletePage,
  }) => {
    await authHelper.logout();
    await authHelper.loginAsUidWithoutProfile();

    await tradesmanSignupCompletePage.page.goto("/tradesman/signup/complete");
    await tradesmanSignupCompletePage.expectNotBlocked();
  });
});
