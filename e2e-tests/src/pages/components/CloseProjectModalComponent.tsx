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
  /** Select the first available tradesperson option instead of matching by label. */
  selectFirstTradesperson?: boolean;
  /** Tick the "Someone else" toggle instead of choosing from the dropdown. */
  pickSomeoneElse?: boolean;

  photoPaths?: string[];

  /** CR3: answer the "Were you satisfied with the work?" question. Only
   *  meaningful when a real tradesperson was selected (not "someone else"). */
  satisfied?: "yes" | "no";
  /** CR3: tick "Give them a boost". Only applies when satisfied="yes". */
  boost?: boolean;
};

export class CloseProjectModalComponent {
  readonly page: Page;

  readonly dialog: Locator;
  readonly title: Locator;
  readonly backdrop: Locator;

  readonly closeX: Locator;

  readonly didGoAheadCheckbox: Locator;
  readonly segmentYes: Locator;
  readonly segmentNo: Locator;

  readonly reasonsFieldset: Locator;
  readonly reasonBudget: Locator;
  readonly reasonNoShow: Locator;
  readonly reasonQuoteTooHigh: Locator;
  readonly reasonTradesmanUnavailable: Locator;
  readonly reasonOther: Locator;
  readonly otherText: Locator;

  readonly whoDidWorkSelect: Locator;
  readonly whoDidWorkButton: Locator;
  readonly whoDidWorkListbox: Locator;

  readonly cancelButton: Locator;
  readonly confirmButton: Locator;

  constructor(page: Page) {
    this.page = page;

    this.dialog = page.getByTestId("close-project-modal");
    this.title = page.getByTestId("close-project-title");
    this.backdrop = this.dialog.locator("div").first();

    this.closeX = page.getByTestId("close-project-x");

    // The hidden sr-only checkbox is preserved for state-readback only
    // (isChecked()). The visible UI is now a segmented Yes/No control.
    this.didGoAheadCheckbox = page.getByTestId("input-did-go-ahead");
    this.segmentYes = page.getByTestId("close-segment-yes");
    this.segmentNo = page.getByTestId("close-segment-no");

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
    this.whoDidWorkButton = page.getByTestId("close-who-button");
    this.whoDidWorkListbox = page.getByTestId("close-who-listbox");

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
      // Click the visible segment - the hidden checkbox is sr-only and
      // can't be clicked directly (intercepted by the overlaying div).
      const target = value ? this.segmentYes : this.segmentNo;
      await target.click();
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

  private async openWhoDropdown() {
    await expect(this.whoDidWorkButton).toBeVisible();
    await expect(this.whoDidWorkButton).toBeEnabled({ timeout: 15_000 });
    await this.whoDidWorkButton.click();
    await expect(this.whoDidWorkListbox).toBeVisible();
  }

  private async chooseTradespersonByLabel(label: string) {
    await this.openWhoDropdown();
    const option = this.whoDidWorkListbox
      .getByRole("option")
      .filter({ hasText: new RegExp(label, "i") })
      .first();
    await expect(option).toBeVisible({ timeout: 15_000 });
    await option.click();
    await expect(this.whoDidWorkListbox).toBeHidden();
  }

  /**
   * Pick the first non-"Someone else" option in the dropdown. We skip the
   * synthetic "Someone else" entry because callers asking for the "first"
   * candidate are testing the rec/share/match path.
   */
  private async selectFirstAvailableTradesperson() {
    await this.openWhoDropdown();
    const option = this.whoDidWorkListbox
      .getByRole("option")
      .filter({ hasNotText: /Someone else/i })
      .first();
    await expect(option).toBeVisible({ timeout: 15_000 });
    await option.click();
    await expect(this.whoDidWorkListbox).toBeHidden();
  }

  private async pickSomeoneElseOption() {
    await this.openWhoDropdown();
    const option = this.whoDidWorkListbox
      .getByRole("option")
      .filter({ hasText: /Someone else/i })
      .first();
    await expect(option).toBeVisible({ timeout: 15_000 });
    await option.click();
    await expect(this.whoDidWorkListbox).toBeHidden();
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

      if (opts.pickSomeoneElse) {
        await this.pickSomeoneElseOption();
      } else if (opts.selectFirstTradesperson) {
        await this.selectFirstAvailableTradesperson();
      } else if (opts.tradespersonLabel) {
        await this.chooseTradespersonByLabel(opts.tradespersonLabel);
      }

      // CR3: drive the new satisfaction sub-flow. Off-platform hires
      // skip this whole block — the question isn't rendered for them.
      if (opts.satisfied && !opts.pickSomeoneElse) {
        await this.page.getByTestId(`satisfied-${opts.satisfied}`).click();
        if (opts.satisfied === "yes" && opts.boost) {
          await this.page.getByTestId("close-boost-checkbox").check();
        }
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
