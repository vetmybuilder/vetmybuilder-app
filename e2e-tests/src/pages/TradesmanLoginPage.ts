import { expect, type Locator, type Page } from "@playwright/test";

export class TradesmanLoginPage {
  readonly page: Page;
  readonly root: Locator;
  readonly googleButton: Locator;
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly signInButton: Locator;
  readonly errorMessage: Locator;
  readonly createAccountLink: Locator;

  constructor(page: Page) {
    this.page = page;
    this.root = page.getByTestId("tradesman-login-page");
    this.googleButton = page.getByRole("button", { name: "Continue with Google" });
    this.emailInput = page.getByTestId("input-tradesman-login-email");
    this.passwordInput = page.getByTestId("input-tradesman-login-password");
    this.signInButton = page.getByTestId("btn-tradesman-login");
    this.errorMessage = page.getByTestId("tradesman-login-error");
    this.createAccountLink = page.getByTestId("tradesman-link-to-register");
  }

  async goto(): Promise<void> {
    await this.page.goto("/tradesman/login");
  }

  async expectVisible(): Promise<void> {
    await expect(this.page).toHaveURL(/\/tradesman\/login/, { timeout: 15_000 });
    await expect(this.root).toBeVisible({ timeout: 10_000 });
  }

  async expectGoogleButtonVisible(): Promise<void> {
    await expect(this.googleButton).toBeVisible();
  }

  async expectEmailFormVisible(): Promise<void> {
    await expect(this.emailInput).toBeVisible();
    await expect(this.passwordInput).toBeVisible();
    await expect(this.signInButton).toBeVisible();
  }
}

export default TradesmanLoginPage;
