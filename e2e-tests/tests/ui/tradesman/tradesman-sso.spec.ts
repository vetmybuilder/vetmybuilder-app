import { test, expect } from "../../../src/ui.fixtures";
import { mockPostcodesIo } from "../../../src/helpers/PostcodesIoMock";

test.describe("Tradesman SSO", () => {
  test.describe.configure({ mode: "serial" });

  test("tradesman login page shows Google button and email form", async ({
    authHelper,
    tradesmanLoginPage,
  }) => {
    await authHelper.ensureGuest();
    await tradesmanLoginPage.goto();
    await tradesmanLoginPage.expectVisible();
    await tradesmanLoginPage.expectGoogleButtonVisible();
    await tradesmanLoginPage.expectEmailFormVisible();
  });

  test("new user with oauthRole=tradesman is redirected to completion page", async ({
    authHelper,
    tradesmanLoginPage,
    tradesmanSignupCompletePage,
  }) => {
    await authHelper.loginAsTradesmanSsoUser();
    await tradesmanLoginPage.goto();
    await tradesmanSignupCompletePage.expectVisible();
  });

  test("completing the form creates a tradesman profile and redirects to dashboard", async ({
    authHelper,
    page,
    tradesmanSignupCompletePage,
  }) => {
    await authHelper.loginAsTradesmanSsoUser();
    await mockPostcodesIo(page);
    await tradesmanSignupCompletePage.goto();
    await tradesmanSignupCompletePage.expectVisible();

    await tradesmanSignupCompletePage.companyName.fill("SSO Plumbing Ltd");
    await tradesmanSignupCompletePage.selectTradeType("Plumber");
    await tradesmanSignupCompletePage.selectTradeType("Bathroom Fitter");
    await tradesmanSignupCompletePage.addServiceArea("SW1A 1AA");

    await tradesmanSignupCompletePage.submit();
    await tradesmanSignupCompletePage.expectOnDashboard();
  });

  test("returning tradesman goes straight to dashboard", async ({
    authHelper,
    tradesmanApi,
    page,
  }) => {
    const uid = `returning-trade-${Date.now()}`;

    await tradesmanApi.joinAsUser(uid, {
      companyName: "Returning SSO Co",
      tradeTypes: "Electrician",
      serviceAreas: "N17",
    });

    await authHelper.loginAsExistingTradesman(uid);
    await page.goto("/tradesman/projects");
    await page.waitForURL(/\/tradesman\/projects/, { timeout: 15_000 });
    await expect(page).toHaveURL(/\/tradesman\/projects/);
  });

  test("completion page redirects to login when not authenticated", async ({
    authHelper,
    tradesmanSignupCompletePage,
    tradesmanLoginPage,
  }) => {
    await authHelper.ensureGuest();
    await tradesmanSignupCompletePage.goto();
    await tradesmanLoginPage.expectVisible();
  });

  test("shows validation error when submitted with empty fields", async ({
    authHelper,
    tradesmanSignupCompletePage,
  }) => {
    await authHelper.loginAsTradesmanSsoUser();
    await tradesmanSignupCompletePage.goto();
    await tradesmanSignupCompletePage.expectVisible();
    await tradesmanSignupCompletePage.submit();

    await expect(tradesmanSignupCompletePage.formError).toHaveText(
      "Please fill in all required fields.",
    );
  });
});
