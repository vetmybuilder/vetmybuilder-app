import { expect, type Locator, type Page } from "@playwright/test";

export class ReportModal {
  readonly page: Page;
  readonly modal: Locator;

  constructor(page: Page) {
    this.page = page;
    this.modal = page.getByTestId("report-modal");
  }

  /** Dismiss cookie consent banner if visible so it doesn't block clicks. */
  static async dismissCookieBanner(page: Page): Promise<void> {
    const gotIt = page.getByRole("button", { name: "Got it" });
    if (await gotIt.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await gotIt.click();
    }
  }

  async expectVisible(): Promise<void> {
    await expect(this.modal).toBeVisible({ timeout: 5_000 });
  }

  async expectNotVisible(): Promise<void> {
    await expect(this.modal).not.toBeVisible();
  }

  async selectCategory(label: string): Promise<void> {
    await this.modal.getByText(label, { exact: true }).click();
  }

  async fillDetail(text: string): Promise<void> {
    await this.modal.locator("textarea").fill(text);
  }

  async submit(): Promise<void> {
    const btn = this.modal.getByRole("button", { name: "Submit report" });
    await btn.scrollIntoViewIfNeeded();
    await btn.click();
  }

  async expectConfirmation(): Promise<void> {
    await expect(
      this.modal.getByText("Thanks for letting us know"),
    ).toBeVisible({ timeout: 5_000 });
    await expect(
      this.modal.getByText("We'll review this within 48 hours"),
    ).toBeVisible();
  }

  async expectAlreadyReported(): Promise<void> {
    await expect(
      this.modal.getByText("You've already reported this"),
    ).toBeVisible({ timeout: 5_000 });
  }

  async close(): Promise<void> {
    await this.modal.getByRole("button", { name: "Close" }).click();
  }

  async submitReport(category: string, detail?: string): Promise<void> {
    await this.expectVisible();
    await this.selectCategory(category);
    if (detail) await this.fillDetail(detail);
    await this.submit();
    await this.expectConfirmation();
  }
}

export default ReportModal;
