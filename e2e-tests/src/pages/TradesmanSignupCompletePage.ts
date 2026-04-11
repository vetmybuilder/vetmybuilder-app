import { expect, type Locator, type Page } from "@playwright/test";

export class TradesmanSignupCompletePage {
  readonly page: Page;
  readonly root: Locator;
  readonly companyName: Locator;
  readonly areasInput: Locator;
  readonly submitButton: Locator;
  readonly formError: Locator;

  constructor(page: Page) {
    this.page = page;
    this.root = page.getByTestId("tradesman-signup-complete-page");
    this.companyName = page.getByTestId("tradesman-complete-company");
    this.areasInput = page.getByTestId("input-areas").locator("input").first();
    this.submitButton = page.getByTestId("btn-tradesman-complete");
    this.formError = page.getByTestId("tradesman-complete-error");
  }

  async goto(): Promise<void> {
    await this.page.goto("/tradesman/signup/complete");
  }

  async expectVisible(): Promise<void> {
    await expect(this.page).toHaveURL(/\/tradesman\/signup\/complete/, { timeout: 15_000 });
    await expect(this.root).toBeVisible({ timeout: 10_000 });
  }

  async selectTradeType(label: string) {
    await this.page
      .getByRole("button", { name: label, exact: true })
      .first()
      .click();
  }

  async addServiceArea(postcode: string) {
    await this.areasInput.fill(postcode);
    await this.areasInput.press("Enter");
    const outwardCode = postcode.split(" ")[0];
    await expect(
      this.page.locator(`[aria-label="Remove ${outwardCode}"]`),
    ).toBeVisible({ timeout: 5_000 });
  }

  async submit(): Promise<void> {
    await expect(this.submitButton).toBeEnabled();
    await this.submitButton.click();
  }

  async expectOnDashboard(): Promise<void> {
    await this.page.waitForURL(/\/tradesman\/projects/, { timeout: 20_000 });
  }
}

export default TradesmanSignupCompletePage;
