import { expect, type Locator, type Page } from "@playwright/test";

export class AdminLoginPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly continueButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole("heading", { name: "Admin sign-in" });
    this.continueButton = page.getByTestId("admin-login-continue");
  }

  async visit() {
    await this.page.goto("/admin/login");
    await expect(this.heading).toBeVisible();
  }

  async continueToLogin() {
    await expect(this.continueButton).toBeVisible();
    await this.continueButton.click();
    await expect(this.page).toHaveURL(/\/login\?next.*admin/, {
      timeout: 20_000,
    });
  }
}

export default AdminLoginPage;
