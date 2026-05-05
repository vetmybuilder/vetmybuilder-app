import { expect, type Locator, type Page } from "@playwright/test";

export class ReportModal {
  readonly page: Page;
  readonly modal: Locator;

  constructor(page: Page) {
    this.page = page;
    this.modal = page.getByTestId("report-modal").filter({ visible: true });
  }

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
    await this.modal.getByRole("button", { name: label, exact: true }).click();
  }

  async fillDetail(text: string): Promise<void> {
    const toggle = this.modal.getByRole("button", {
      name: /add detail|hide detail/i,
    });
    if ((await toggle.textContent())?.toLowerCase().includes("add detail")) {
      await toggle.click();
    }
    await this.modal.locator("textarea").fill(text);
  }

  async submit(): Promise<void> {
    const btn = this.modal.getByRole("button", { name: /^submit report$/i });
    await btn.scrollIntoViewIfNeeded();
    await btn.click();
  }

  /**
   * After a successful submit:
   *   Mobile  - the sheet stays mounted with an inline confirmation block
   *             (`report-success` testid).
   *   Desktop - the modal closes and a toast appears at the bottom of the
   *             page (`report-success-toast` testid).
   * Either signal is acceptable; first one to appear wins.
   */
  async expectConfirmation(): Promise<void> {
    const mobileInline = this.page
      .getByTestId("report-success")
      .filter({ visible: true });
    const desktopToast = this.page
      .getByTestId("report-success-toast")
      .filter({ visible: true });
    await expect(mobileInline.or(desktopToast).first()).toBeVisible({
      timeout: 5_000,
    });
  }

  async expectAlreadyReported(): Promise<void> {
    const error = this.modal.getByTestId("report-error");
    await expect(error).toBeVisible();
    await expect(error).toContainText('You\'ve already reported this. We\'re looking into it.');
  }

  /**
   * Dismiss the post-submit success view and wait until it's fully gone.
   *   Mobile  - clicks the inline "Close" button on the success sheet.
   *   Desktop - the toast auto-dismisses; just wait for it to disappear
   *             so the parent's open-state has actually flipped back to
   *             false before the next interaction.
   */
  async close(): Promise<void> {
    const closeBtn = this.modal.getByRole("button", { name: "Close" });
    if (await closeBtn.isVisible({ timeout: 1_000 }).catch(() => false)) {
      await closeBtn.click();
    }
    await expect(
      this.page
        .getByTestId("report-modal")
        .or(this.page.getByTestId("report-success-toast")),
    ).toHaveCount(0, { timeout: 10_000 });
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
