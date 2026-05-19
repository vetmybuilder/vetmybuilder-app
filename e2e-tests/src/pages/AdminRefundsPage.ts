import { expect, type Locator, type Page } from "@playwright/test";
import BasePage from "./BasePage";

/**
 * /admin/refunds - issues Stripe refunds by payment_intent or charge id
 * and audits each attempt in the admin_refunds table. The page itself
 * makes no DB state changes beyond the audit row; the admin handles
 * any knock-on cleanup (re-locking unlocks, sub state) manually.
 */
export class AdminRefundsPage extends BasePage {
  readonly form: Locator;
  readonly piInput: Locator;
  readonly chargeInput: Locator;
  readonly amountInput: Locator;
  readonly reasonInput: Locator;
  readonly submitButton: Locator;
  readonly flash: Locator;
  readonly rows: Locator;

  constructor(page: Page) {
    super(page);
    this.form = page.getByTestId("admin-refund-form");
    this.piInput = page.getByTestId("admin-refund-pi");
    this.chargeInput = page.getByTestId("admin-refund-ch");
    this.amountInput = page.getByTestId("admin-refund-amount");
    this.reasonInput = page.getByTestId("admin-refund-reason");
    this.submitButton = page.getByTestId("admin-refund-submit");
    this.flash = page.getByTestId("admin-refund-flash");
    this.rows = page.getByTestId("admin-refund-rows");
  }

  async goto(): Promise<void> {
    await this.page.goto("/admin/refunds", { waitUntil: "domcontentloaded" });
    await expect(this.form).toBeVisible({ timeout: 20_000 });
  }

  async refundByPaymentIntent(pi: string, reason: string): Promise<void> {
    await this.piInput.fill(pi);
    await this.reasonInput.fill(reason);
    await this.submitButton.click();
  }

  async expectFlashContains(text: string | RegExp): Promise<void> {
    await expect(this.flash).toContainText(text, { timeout: 10_000 });
  }

  async expectRowFor(stripeId: string): Promise<void> {
    await expect(this.rows).toContainText(stripeId, { timeout: 10_000 });
  }

  async expectRowWithReason(reason: string): Promise<void> {
    await expect(this.rows).toContainText(reason, { timeout: 10_000 });
  }
}

export default AdminRefundsPage;
