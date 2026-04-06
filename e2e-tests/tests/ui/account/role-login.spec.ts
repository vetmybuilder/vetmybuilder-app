import { test, expect } from "../../../src/ui.fixtures";
import Account from "../../../src/models/Account";
import Tradesman from "../../../src/models/tradesman";
import { createAuthUser } from "../../../src/helpers/FirebaseSeed";
import { authedApiForUid } from "../../../src/api/services/client";
import { AuthApi } from "../../../src/apiHelper/auth/AuthApi";

test.describe("Role-based login validation", () => {
  test("homeowner on trade login form sees error and link to homeowner login", async ({
    request,
    runtime,
    loginPage,
    siteHeader,
  }) => {
    const password = "Passw0rd!";
    const email = `role-hw+${Date.now()}@test.com`;

    // Seed a homeowner account
    const authUser = await createAuthUser(email, password);
    const client = await authedApiForUid(
      request,
      runtime.apiBaseUrl,
      authUser.uid,
    );
    await AuthApi.signup(
      client,
      Account.anAccount()
        .withRandomDetails()
        .withEmail(email)
        .withPassword(password),
    );

    // Submit via the trade login form
    await loginPage.gotoTradeForm();
    await loginPage.loginWith(email, password);

    // Should stay on login page with role_error in URL
    await expect(loginPage.page).toHaveURL(/role_error=not-trade/, {
      timeout: 15_000,
    });
    await loginPage.hasRoleError("not-trade");
    await siteHeader.assertGuestState();
  });

  test("tradesman on homeowner login form sees error and link to tradesman login", async ({
    request,
    runtime,
    loginPage,
    siteHeader,
  }) => {
    const password = "Passw0rd!";
    const email = `role-tm+${Date.now()}@test.com`;

    // Seed a tradesman account
    const authUser = await createAuthUser(email, password);
    const client = await authedApiForUid(
      request,
      runtime.apiBaseUrl,
      authUser.uid,
    );
    await client.put(
      "/api/tradesmen/me",
      Tradesman.aTradesman().withRandomDetails().toPayload(),
    );

    // Submit via the homeowner login form
    await loginPage.goto();
    await loginPage.loginWith(email, password);

    // Should stay on login page with role_error in URL
    await expect(loginPage.page).toHaveURL(/role_error=not-homeowner/, {
      timeout: 15_000,
    });
    await loginPage.hasRoleError("not-homeowner");
    await siteHeader.assertGuestState();
  });
});
