import { Page, Locator, expect } from "@playwright/test";

export class LoginPage {
  readonly page: Page;

  // Page / container
  readonly loginPage: Locator;
  readonly loginCard: Locator;
  readonly title: Locator;

  // Form
  readonly form: Locator;
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly submitButton: Locator;
  readonly errorMessage: Locator;

  // Links
  readonly createOneLink: Locator;

  constructor(page: Page) {
    this.page = page;

    // Containers
    this.loginPage = page.getByTestId("login-page");
    this.loginCard = page.getByTestId("login-card");
    this.title = page.getByTestId("login-title");

    // Form + inputs
    this.form = page.getByTestId("login-form");
    this.emailInput = page.getByTestId("input-login-email");
    this.passwordInput = page.getByTestId("input-login-password");
    this.submitButton = page.getByTestId("btn-login");
    this.errorMessage = page.getByTestId("login-error");

    // Links
    this.createOneLink = page.getByTestId("link-to-register");
  }

  async goto(next?: string) {
    const url = next ? `/login?next=${encodeURIComponent(next)}` : "/login";
    await this.page.goto(url);
    await expect(this.loginPage).toBeVisible();
  }

  async login(email: string, password: string) {
    await this.goto();
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.submitButton.click();
  }

  // Use this variant when a successful login is expected. It waits for the
  // post-login redirect so Firebase auth state is persisted before any
  // subsequent navigation or API calls in the test.
  async loginExpectSuccess(email: string, password: string) {
    await this.login(email, password);
    await expect(this.page).not.toHaveURL(/\/login/, { timeout: 15_000 });
  }

  async loginWith(email: string, password: string) {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.submitButton.click();
  }

  async hasError() {
    await expect(this.errorMessage).toBeVisible({ timeout: 10_000 });
  }

  async navigateToSignup(): Promise<void> {
    await expect(this.createOneLink).toBeVisible();
    await this.createOneLink.click();
    await expect(this.page).toHaveURL("/signup");
  }

  async hasVendorSignupLink(): Promise<void> {
    await expect(this.createOneLink).toHaveAttribute(
      "href",
      "/tradesman/register-tradesmen",
    );
  }
}
