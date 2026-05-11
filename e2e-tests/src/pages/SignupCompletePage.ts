import { expect, type Locator, type Page } from "@playwright/test";

/**
 * Page object for /signup/complete - the post-OAuth profile completion page.
 *
 * A user lands here after signing in via a social provider (e.g. Google) but
 * before they have accepted terms (and, when enabled, supplied a beta
 * access code). First/last name and username are derived server-side from
 * the Firebase token claims. Postcode is no longer captured at signup.
 */
export class SignupCompletePage {
  readonly page: Page;

  readonly root: Locator;
  readonly form: Locator;
  readonly heading: Locator;

  readonly formError: Locator;
  readonly submitButton: Locator;

  constructor(page: Page) {
    this.page = page;

    this.root = page.getByTestId("signup-complete-page");
    this.form = page.getByTestId("signup-complete-form");
    this.heading = page.getByRole("heading", { name: "Almost there" });

    this.formError = page.getByTestId("signup-complete-error");
    this.submitButton = page.getByTestId("btn-signup-complete");
  }

  async expectVisible(): Promise<void> {
    await expect(this.page).toHaveURL(/\/signup\/complete$/, { timeout: 15_000 });
    await expect(this.root).toBeVisible({ timeout: 10_000 });
    await expect(this.heading).toBeVisible();
  }

  async agreeToTerms(): Promise<void> {
    await this.page.getByTestId("agree-terms").locator("input[type='checkbox']").check();
  }

  async submit(): Promise<void> {
    await this.agreeToTerms();
    await expect(this.submitButton).toBeEnabled();
    await this.submitButton.click();
  }

  async completeAndExpectRedirect(
    expectedUrl: string | RegExp = "/projects",
  ): Promise<void> {
    await this.submit();
    await this.page.waitForURL(expectedUrl, { timeout: 20_000 });
  }
}

export default SignupCompletePage;
