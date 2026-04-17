import { expect, type Locator, type Page } from "@playwright/test";

/**
 * Page object for /tradesman/signup/complete — the post-OAuth tradesman
 * onboarding wizard.
 *
 * Reuses the same Step1Company / Step2Trades / Step3Offers components as
 * /tradesman/register-tradesmen, so the testids on inputs match the main
 * register wizard: `input-company-name`, `input-contact-name`, etc. The
 * difference vs. register-tradesmen is that this page has no Step 4 — the
 * user is already Firebase-authed via Google, so Step 3's primary action
 * is "Finish sign up" and saves the profile directly.
 */
export class TradesmanSignupCompletePage {
  readonly page: Page;

  readonly root: Locator;
  readonly step1: Locator;
  readonly step2: Locator;
  readonly step3: Locator;

  readonly companyName: Locator;
  readonly contactName: Locator;
  readonly email: Locator;
  readonly areasInput: Locator;
  readonly nextButton: Locator;
  readonly continueButton: Locator;
  readonly formError: Locator;
  readonly existingHomeownerBlock: Locator;

  constructor(page: Page) {
    this.page = page;
    this.root = page.getByTestId("tradesman-signup-complete-page");
    this.existingHomeownerBlock = page.getByTestId("existing-homeowner-block");
    this.step1 = page.getByTestId("step-1");
    this.step2 = page.getByTestId("step-2");
    this.step3 = page.getByTestId("step-3");

    this.companyName = page.getByTestId("input-company-name");
    this.contactName = page.getByTestId("input-contact-name");
    this.email = page.getByTestId("input-email");
    this.areasInput = page.getByTestId("input-areas").locator("input").first();
    this.nextButton = page.getByTestId("btn-next");
    this.continueButton = page.getByTestId("btn-continue");
    this.formError = page.getByTestId("tradesman-signup-complete-error");
  }

  async expectVisible(): Promise<void> {
    await expect(this.page).toHaveURL(/\/tradesman\/signup\/complete$/, {
      timeout: 15_000,
    });
    await expect(this.root).toBeVisible({ timeout: 10_000 });
    await expect(this.step1).toBeVisible({ timeout: 10_000 });
  }

  async expectBlockedAsExistingHomeowner(): Promise<void> {
    await expect(this.page).toHaveURL(/\/tradesman\/signup\/complete$/, {
      timeout: 15_000,
    });
    await expect(this.existingHomeownerBlock).toBeVisible({ timeout: 15_000 });
    await expect(this.existingHomeownerBlock).toContainText(
      "You already have a homeowner account with this email",
    );
  }

  async expectNotBlocked(): Promise<void> {
    await expect(this.existingHomeownerBlock).toHaveCount(0);
    await expect(this.root).toBeVisible({ timeout: 15_000 });
  }

  async addServiceArea(postcode: string): Promise<void> {
    await this.areasInput.fill(postcode);
    await this.areasInput.press("Enter");
    const outward = postcode.split(" ")[0];
    await expect(
      this.page.locator(`[aria-label="Remove ${outward}"]`),
    ).toBeVisible({ timeout: 5_000 });
  }

  async fillStep1(input: { companyName: string; contactName?: string }): Promise<void> {
    await this.companyName.fill(input.companyName);
    if (input.contactName !== undefined) {
      await this.contactName.fill(input.contactName);
    }
  }

  async goToStep2(): Promise<void> {
    await this.nextButton.click();
    await expect(this.step2).toBeVisible({ timeout: 15_000 });
  }

  async selectTrade(label: string): Promise<void> {
    await this.page
      .getByRole("button", { name: label, exact: true })
      .first()
      .click();
  }

  async goToStep3(): Promise<void> {
    await this.continueButton.click();
    await expect(this.step3).toBeVisible({ timeout: 15_000 });
  }

  async agreeToTerms(): Promise<void> {
    await this.page.getByTestId("agree-terms").locator("input[type='checkbox']").check();
  }

  async submitStep3(): Promise<void> {
    // Step 3's primary button reuses Step3Offers' `btn-continue` testid
    // (label is overridden to "Finish sign up" via the primaryLabel prop).
    // The button is scoped to step-3 to disambiguate from step-2's
    // continue button if either is briefly mounted during a transition.
    await this.agreeToTerms();
    await this.step3.getByTestId("btn-continue").click();
  }
}

export default TradesmanSignupCompletePage;
