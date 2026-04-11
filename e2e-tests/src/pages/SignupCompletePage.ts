import { expect, type Locator, type Page } from "@playwright/test";

/**
 * Page object for /signup/complete — the post-OAuth profile completion page.
 *
 * A user lands here after signing in via a social provider (e.g. Google) but
 * before they have a homeowner profile (specifically, before they have a
 * postcode) in MySQL. The page only collects a postcode — first/last name
 * and username are derived server-side from the Firebase token claims.
 */
export class SignupCompletePage {
  readonly page: Page;

  readonly root: Locator;
  readonly form: Locator;
  readonly heading: Locator;

  readonly location: Locator;

  readonly locationError: Locator;
  readonly formError: Locator;
  readonly submitButton: Locator;

  constructor(page: Page) {
    this.page = page;

    this.root = page.getByTestId("signup-complete-page");
    this.form = page.getByTestId("signup-complete-form");
    this.heading = page.getByRole("heading", { name: "Almost there" });

    this.location = page.getByLabel("Postcode or City/Borough", {
      exact: true,
    });

    this.locationError = page.getByTestId("complete-complete-loc-error");
    this.formError = page.getByTestId("signup-complete-error");
    this.submitButton = page.getByTestId("btn-signup-complete");
  }

  async expectVisible(): Promise<void> {
    await expect(this.page).toHaveURL(/\/signup\/complete$/, { timeout: 15_000 });
    await expect(this.root).toBeVisible({ timeout: 10_000 });
    await expect(this.heading).toBeVisible();
  }

  async fill(input: { location: string }): Promise<void> {
    await this.location.fill(input.location);
    // Dismiss the postcode autocomplete dropdown so it doesn't intercept
    // the submit click. Same pattern as RegisterPage.
    await this.location.press("Escape");
    await this.page
      .locator('[role="listbox"]')
      .waitFor({ state: "hidden", timeout: 3_000 })
      .catch(() => {});
  }

  async submit(): Promise<void> {
    await expect(this.submitButton).toBeEnabled();
    await this.submitButton.click();
  }

  async completeAndExpectRedirect(
    input: { location: string },
    expectedUrl: string | RegExp = "/projects",
  ): Promise<void> {
    await this.fill(input);
    await this.submit();
    await this.page.waitForURL(expectedUrl, { timeout: 20_000 });
  }
}

export default SignupCompletePage;
