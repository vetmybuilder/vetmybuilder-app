import { test } from "../../../src/ui.fixtures";
import Tradesman from "../../../src/models/tradesman";

test.describe("Tradesman login - dual-role interstitial", () => {
  test("guest is redirected to /login with next=/tradesman/jobs", async ({
    authHelper,
    tradesmanLoginPage,
  }) => {
    await authHelper.ensureGuest();
    await tradesmanLoginPage.goto();

    // Tradesman post-login destination renamed /tradesman/jobs ->
    // /tradesman/jobs (commit 683f7c2 "feat: rename Projects section to
    // Jobs in burger menu").
    await tradesmanLoginPage.expectRedirectedTo(
      /\/login\?.*next=%2Ftradesman%2Fjobs/,
    );
    await tradesmanLoginPage.expectInterstitialNotVisible();
  });

  test("signed-in tradesperson is redirected to /tradesman/jobs", async ({
    authHelper,
    tradesmanLoginPage,
  }) => {
    const tradesman = Tradesman.aTradesman().withRandomDetails();
    await authHelper.logout();
    await authHelper.signInAsNewTradesman(tradesman);
    await tradesmanLoginPage.goto();

    await tradesmanLoginPage.expectRedirectedTo(/\/tradesman\/jobs/);
    await tradesmanLoginPage.expectInterstitialNotVisible();
  });

  test("signed-in completed homeowner is redirected away without the interstitial", async ({
    authHelper,
    tradesmanLoginPage,
  }) => {
    await authHelper.logout();
    await authHelper.loginAsHomeowner({
      firstName: "Casey",
      lastName: "Homeowner",
      location: "E4",
    });
    await tradesmanLoginPage.goto();

    await tradesmanLoginPage.expectRedirectedAwayFromLogin();
  });

  test("signed-in with incomplete homeowner sees the interstitial", async ({
    authHelper,
    tradesmanLoginPage,
  }) => {
    await authHelper.logout();
    await authHelper.loginAsUidWithoutProfile();
    await tradesmanLoginPage.goto();

    await tradesmanLoginPage.expectInterstitialVisible();
  });

  test("continue as tradesperson routes to /tradesman/signup/complete", async ({
    authHelper,
    tradesmanLoginPage,
  }) => {
    await authHelper.logout();
    await authHelper.loginAsUidWithoutProfile();
    await tradesmanLoginPage.goto();
    await tradesmanLoginPage.expectInterstitialVisible();

    await tradesmanLoginPage.continueAsTradesperson();
  });

  test("sign out and start over clears auth and lands on /", async ({
    authHelper,
    tradesmanLoginPage,
  }) => {
    await authHelper.logout();
    await authHelper.loginAsUidWithoutProfile();
    await tradesmanLoginPage.goto();
    await tradesmanLoginPage.expectInterstitialVisible();

    await tradesmanLoginPage.signOutAndStartOver();
  });
});
