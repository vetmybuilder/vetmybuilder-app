// e2e-tests/src/pages/ForgotPasswordPage.ts
import { Page, Locator, expect } from "@playwright/test";
import { safeGoto } from "../helpers/navigation";

export class ForgotPasswordPage {
  readonly page: Page;
  readonly card: Locator;
  readonly emailInput: Locator;
  readonly submitButton: Locator;
  readonly successMessage: Locator;

  constructor(page: Page) {
    this.page = page;
    this.card = page.getByTestId("forgot-password-card");
    this.emailInput = page.getByTestId("input-forgot-email");
    this.submitButton = page.getByTestId("btn-forgot-submit");
    this.successMessage = page.getByTestId("forgot-password-success");
  }

  async goto() {
    await safeGoto(this.page, "/forgot-password");
    await expect(this.card).toBeVisible({ timeout: 10_000 });
  }

  async submitEmail(email: string) {
    await this.emailInput.fill(email);
    await this.submitButton.click();
  }

  async expectSuccess() {
    await expect(this.successMessage).toBeVisible({ timeout: 10_000 });
  }
}
