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
    // /login is a guest-only page; ensure we're logged out before navigating
    await this.page.goto("/logout", { waitUntil: "domcontentloaded" });
    await this.page
      .waitForURL(/signedOut=1/, { timeout: 15_000 })
      .catch(() => {});

    const url = next ? `/login?next=${encodeURIComponent(next)}` : "/login";
    try {
      await this.page.goto(url);
    } catch (error) {
      const message = String(error);
      if (message.includes("interrupted by another navigation")) {
        await this.page.waitForURL(/\/login/, { waitUntil: "domcontentloaded" });
      } else if (message.includes("WebKit encountered an internal error")) {
        // WebKit can crash on first navigation under resource pressure; retry once.
        await this.page.goto(url);
      } else {
        throw error;
      }
    }
    await expect(this.loginPage).toBeVisible({ timeout: 15_000 });
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

  async clickCreateOneLink(): Promise<void> {
    await expect(this.createOneLink).toBeVisible();
    await this.createOneLink.click();
  }

  async hasVendorSignupLink(): Promise<void> {
    await expect(this.createOneLink).toHaveAttribute(
      "href",
      "/tradesman/register-tradesmen",
    );
  }
}
