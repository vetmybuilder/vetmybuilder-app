// e2e-tests/src/pages/ResetPasswordPage.ts
import { Page, Locator, expect } from "@playwright/test";
import Account from "../models/Account";
import { safeGoto } from "../helpers/navigation";

export class ResetPasswordPage {
  readonly page: Page;
  readonly card: Locator;
  readonly newPasswordInput: Locator;
  readonly confirmPasswordInput: Locator;
  readonly submitButton: Locator;
  readonly successMessage: Locator;

  constructor(page: Page) {
    this.page = page;
    this.card = page.getByTestId("reset-password-card");
    this.newPasswordInput = page.getByTestId("input-new-password");
    this.confirmPasswordInput = page.getByTestId("input-confirm-password");
    this.submitButton = page.getByTestId("btn-set-password");
    this.successMessage = page.getByTestId("reset-password-success");
  }

  async gotoWithCode(oobCode: string) {
    await safeGoto(this.page, `/reset-password?oobCode=${oobCode}`);
    await expect(this.card).toBeVisible({ timeout: 10_000 });
  }

  async setPassword(password: string) {
    await this.newPasswordInput.fill(password);
    await this.confirmPasswordInput.fill(password);
  }

  async submit() {
    await this.submitButton.click();
  }

  async expectSuccess() {
    await expect(this.successMessage).toBeVisible({ timeout: 10_000 });
  }

  async expectSubmitDisabled() {
    await expect(this.submitButton).toBeDisabled();
  }

  async rejectWeakPasswords() {
    for (const { value, label } of Account.WEAK_PASSWORDS) {
      await this.newPasswordInput.fill(value);
      await this.confirmPasswordInput.fill(value);
      await expect(
        this.submitButton,
        `button should be disabled for: ${label}`,
      ).toBeDisabled();
    }
  }
}
