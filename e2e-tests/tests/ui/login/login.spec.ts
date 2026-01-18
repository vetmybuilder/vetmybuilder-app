import { test, expect } from "../../../src/ui.base.fixtures";

test("homeowner can sign in and see account initials", async ({
  page,
  loginPage,
  siteHeader,
}) => {
  await page.goto("/");
  await siteHeader.navSignIn.click();
  await loginPage.loginWith(
    process.env.E2E_ADMIN_USER_EMAIL as string,
    process.env.E2E_ADMIN_USER_PASSWORD as string,
  );
  await expect(siteHeader.initialsBadge("BS")).toBeVisible();
});
  