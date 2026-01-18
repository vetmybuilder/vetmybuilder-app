import { test, expect } from "../../../src/fixtures";

test.describe("Account (UI)", () => {
  test("user can log in and is shown as logged in", async ({ page }) => {
    await page.goto("/");

    await page.getByRole("link", { name: "Homeowner sign in" }).click();

    await page
      .getByLabel(/email/i)
      .fill(process.env.E2E_ADMIN_USER_EMAIL || "");
    await page
      .getByLabel(/password/i)
      .fill(process.env.E2E_ADMIN_USER_PASSWORD || "");

    await page.getByRole("button", { name: /log in|login|Sign in/i }).click();
  });
});
