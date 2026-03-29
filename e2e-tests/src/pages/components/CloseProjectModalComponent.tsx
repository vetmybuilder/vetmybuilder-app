import { expect, type Locator, type Page } from "@playwright/test";

export type DidNotGoAheadReason =
  | "budget"
  | "no_show"
  | "quote_too_high"
  | "tradesman_unavailable"
  | "other";

export type CloseProjectOptions = {
  didGoAhead?: boolean;

  reasons?: DidNotGoAheadReason[];
  otherReasonText?: string;

  tradespersonLabel?: string;

  photoPaths?: string[];
};

export class CloseProjectModalComponent {
  readonly page: Page;

  readonly dialog: Locator;
  readonly title: Locator;
  readonly backdrop: Locator;

  readonly closeX: Locator;

  readonly didGoAheadCheckbox: Locator;

  readonly reasonsFieldset: Locator;
  readonly reasonBudget: Locator;
  readonly reasonNoShow: Locator;
  readonly reasonQuoteTooHigh: Locator;
  readonly reasonTradesmanUnavailable: Locator;
  readonly reasonOther: Locator;
  readonly otherText: Locator;

  readonly whoDidWorkSelect: Locator;

  readonly cancelButton: Locator;
  readonly confirmButton: Locator;

  constructor(page: Page) {
    this.page = page;

    this.dialog = page.getByTestId("close-project-modal");
    this.title = page.getByTestId("close-project-title");
    this.backdrop = this.dialog.locator("div").first();

    this.closeX = page.getByTestId("close-project-x");

    this.didGoAheadCheckbox = page.getByTestId("input-did-go-ahead");

    this.reasonsFieldset = page.getByTestId("fieldset-reasons");
    this.reasonBudget = page.getByTestId("reason-budget");
    this.reasonNoShow = page.getByTestId("reason-no-show");
    this.reasonQuoteTooHigh = page.getByTestId("reason-quote-too-high");
    this.reasonTradesmanUnavailable = page.getByTestId(
      "reason-tradesman-unavailable",
    );
    this.reasonOther = page.getByTestId("reason-other");
    this.otherText = page.getByTestId("input-reason-other-text");

    this.whoDidWorkSelect = page.getByTestId("select-who-did-work");

    this.cancelButton = page.getByTestId("btn-cancel-close");
    this.confirmButton = page.getByTestId("btn-confirm-close");
  }

  async assertVisible() {
    await expect(this.dialog).toBeVisible();
  }

  async assertHidden() {
    await expect(this.dialog).toBeHidden();
  }

  private async setDidGoAhead(value: boolean) {
    const checked = await this.didGoAheadCheckbox.isChecked();
    if (checked !== value) {
      await this.didGoAheadCheckbox.click();
      await expect(this.didGoAheadCheckbox).toBeChecked({ checked: value });
    }
  }

  private getReasonLocator(reason: DidNotGoAheadReason): Locator {
    if (reason === "budget") return this.reasonBudget;
    if (reason === "no_show") return this.reasonNoShow;
    if (reason === "quote_too_high") return this.reasonQuoteTooHigh;
    if (reason === "tradesman_unavailable")
      return this.reasonTradesmanUnavailable;
    return this.reasonOther;
  }

  private async toggleReason(reason: DidNotGoAheadReason, enabled: boolean) {
    const locator = this.getReasonLocator(reason);
    const isChecked = await locator.isChecked();
    if (isChecked !== enabled) {
      await locator.click();
      await expect(locator).toBeChecked({ checked: enabled });
    }
  }

  private async setReasons(reasons: DidNotGoAheadReason[], otherText?: string) {
    await expect(this.reasonsFieldset).toBeVisible();

    const all: DidNotGoAheadReason[] = [
      "budget",
      "no_show",
      "quote_too_high",
      "tradesman_unavailable",
      "other",
    ];

    for (const r of all) {
      await this.toggleReason(r, reasons.includes(r));
    }

    if (reasons.includes("other")) {
      await expect(this.otherText).toBeVisible();
      await this.otherText.fill(otherText ?? "");
    } else {
      await expect(this.otherText).toBeHidden();
    }
  }

  private async chooseTradespersonByLabel(label: string) {
    await expect(this.whoDidWorkSelect).toBeVisible();

    try {
      await this.whoDidWorkSelect.selectOption({ label });
      return;
    } catch {}

    const options = this.whoDidWorkSelect.locator("option");
    const count = await options.count();

    let matchedValue: string | null = null;

    for (let i = 0; i < count; i++) {
      const opt = options.nth(i);
      const text = (await opt.textContent())?.trim() || "";
      if (text.toLowerCase().includes(label.toLowerCase())) {
        matchedValue = await opt.getAttribute("value");
        if (matchedValue) break;
      }
    }

    if (!matchedValue) {
      throw new Error(
        `CloseProjectModal: tradesperson not found for "${label}"`,
      );
    }

    await this.whoDidWorkSelect.selectOption(matchedValue);
  }

  private async uploadPhotos(photoPaths: string[]) {
    if (!photoPaths.length) return;
    const fileInput = this.dialog.locator('input[type="file"]').first();
    await expect(fileInput).toBeVisible();
    await fileInput.setInputFiles(photoPaths);
  }

  async closeProject(options?: CloseProjectOptions) {
    await this.assertVisible();

    const opts = options ?? {};
    const didGoAhead = opts.didGoAhead ?? true;

    await this.setDidGoAhead(didGoAhead);

    if (!didGoAhead) {
      await this.setReasons(opts.reasons ?? [], opts.otherReasonText);
    } else {
      await expect(this.reasonsFieldset).toBeHidden();

      if (opts.tradespersonLabel) {
        await this.chooseTradespersonByLabel(opts.tradespersonLabel);
      }

      if (opts.photoPaths?.length) {
        await this.uploadPhotos(opts.photoPaths);
      }
    }

    await this.confirmButton.click();
    await this.assertHidden();
  }

  async cancel() {
    await this.assertVisible();
    await this.cancelButton.click();
    await this.assertHidden();
  }

  async closeViaX() {
    await this.assertVisible();
    await this.closeX.click();
    await this.assertHidden();
  }

  async closeViaBackdrop() {
    await this.assertVisible();
    await this.backdrop.click({ force: true });
    await this.assertHidden();
  }
}

export default CloseProjectModalComponent;
