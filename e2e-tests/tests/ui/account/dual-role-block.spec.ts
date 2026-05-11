import { test } from "../../../src/ui.fixtures";

/**
 * Dual-role behaviour:
 *
 *   Previously: an existing homeowner who tried /tradesman/signup/complete
 *   was blocked with an "Account already exists" screen. That guard piggy-
 *   backed off `profileComplete=true` (which used to mean "has a homeowner
 *   postcode"), and broke after we dropped the postcode requirement at
 *   signup - touchUserMw now creates a `users` row for any signed-in
 *   OAuth user, so even brand-new tradespeople were getting blocked.
 *
 *   New behaviour: any signed-in user who isn't already a tradesperson
 *   can register as one. The `users` row and the `tradesmen` row are
 *   separate, so there's no conflict.
 */
test.describe("Tradesperson signup access", () => {
  test("allows an existing homeowner to also register as a tradesperson", async ({
    authHelper,
    tradesmanSignupCompletePage,
  }) => {
    await authHelper.loginAsHomeowner({
      firstName: "DualRole",
      lastName: "Allowed",
      location: "E4",
    });

    await tradesmanSignupCompletePage.page.goto("/tradesman/signup/complete");
    await tradesmanSignupCompletePage.expectNotBlocked();
  });

  test("allows a fresh OAuth user with no homeowner profile to proceed", async ({
    authHelper,
    tradesmanSignupCompletePage,
  }) => {
    await authHelper.logout();
    await authHelper.loginAsUidWithoutProfile();

    await tradesmanSignupCompletePage.page.goto("/tradesman/signup/complete");
    await tradesmanSignupCompletePage.expectNotBlocked();
  });
});
