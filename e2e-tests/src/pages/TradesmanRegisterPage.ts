import { expect, type Locator, type Page } from "@playwright/test";
import BasePage from "./BasePage";
import { safeGoto } from "../helpers/navigation";
import type Tradesman from "../models/tradesman";

export class TradesmanRegisterPage extends BasePage {
  readonly step1: Locator;
  readonly step2: Locator;
  readonly step3: Locator;
  readonly step4: Locator;
  readonly companyNameInput: Locator;
  readonly contactNameInput: Locator;
  readonly emailInput: Locator;
  readonly phoneInput: Locator;
  readonly areasInput: Locator;
  readonly nextButton: Locator;
  readonly continueButton: Locator;
  readonly fileInput: Locator;
  readonly profileBadge: Locator;

  // Step 4 (account)
  readonly passwordInput: Locator;
  readonly confirmPasswordInput: Locator;
  readonly createAccountButton: Locator;
  readonly createAccountError: Locator;
  readonly passwordChecklist: Locator;

  constructor(page: Page) {
    super(page);
    this.step1 = page.getByTestId("step-1");
    this.step2 = page.getByTestId("step-2");
    this.step3 = page.getByTestId("step-3");
    this.step4 = page.getByTestId("step-4");
    this.companyNameInput = page.getByTestId("input-company-name");
    this.contactNameInput = page.getByTestId("input-contact-name");
    this.emailInput = page.getByTestId("input-email");
    this.phoneInput = page.getByTestId("input-phone");
    this.areasInput = page.getByTestId("input-areas").locator("input").first();
    this.nextButton = page.getByRole("button", { name: /^Next/ });
    this.continueButton = page.getByRole("button", { name: /^Next/ });
    this.fileInput = page.getByTestId("file-input");
    this.profileBadge = page.getByText("Profile", { exact: true });

    this.passwordInput = page.getByTestId("input-password");
    this.confirmPasswordInput = page.getByTestId("input-password-confirm");
    this.createAccountButton = page.getByRole("button", {
      name: /create account/i,
    });
    this.createAccountError = page.getByTestId("create-error");
    this.passwordChecklist = page.getByTestId("password-checklist");
  }

  async goto() {
    await safeGoto(this.page, "/tradesman/register-tradesmen");
    await expect(this.step1).toBeVisible({ timeout: 15_000 });
  }

  async fillStep1(opts: {
    companyName: string;
    contactName: string;
    email: string;
  }) {
    await this.companyNameInput.fill(opts.companyName);
    await this.contactNameInput.fill(opts.contactName);
    await this.emailInput.fill(opts.email);
  }

  async addServiceArea(postcode: string) {
    await this.areasInput.fill(postcode);
    await this.areasInput.press("Enter");
    const outwardCode = postcode.split(" ")[0];
    await expect(
      this.page.locator(`[aria-label="Remove ${outwardCode}"]`),
    ).toBeVisible({ timeout: 5_000 });
  }

  async goToStep2() {
    await this.nextButton.click();
    await expect(this.step2).toBeVisible({ timeout: 15_000 });
  }

  async uploadPhotos(filePaths: string[]) {
    await this.fileInput.setInputFiles(filePaths);
  }

  async assertProfileBadgeVisible() {
    await expect(this.profileBadge.first()).toBeVisible({ timeout: 5_000 });
  }

  async assertProfileBadgeCount(count: number) {
    await expect(this.profileBadge).toHaveCount(count, { timeout: 5_000 });
  }

  async clickUnselectedPhoto() {
    const selectionButtons = this.page.getByRole("button", {
      name: /set as profile picture/i,
    });
    await selectionButtons.first().click();
  }

  /** Click a trade-type pill on Step 2 by its visible label. */
  async selectTradeType(label: string) {
    await this.page
      .getByRole("button", { name: label, exact: true })
      .first()
      .click();
  }

  /** Click Continue on Step 2 → Step 3. */
  async goToStep3() {
    await this.continueButton.click();
    await expect(this.step3).toBeVisible({ timeout: 15_000 });
  }

  /** Click Continue on Step 3 → Step 4 (no required inputs). */
  async goToStep4() {
    await this.continueButton.click();
    await expect(this.step4).toBeVisible({ timeout: 15_000 });
  }

  async fillStep4Password(password: string) {
    await this.passwordInput.fill(password);
  }

  async fillStep4ConfirmPassword(password: string) {
    await this.confirmPasswordInput.fill(password);
  }

  async agreeToTerms(): Promise<void> {
    await this.page.getByTestId("agree-terms").locator("input[type='checkbox']").check();
  }

  async submitStep4() {
    await this.agreeToTerms();
    await this.createAccountButton.click();
  }

  /**
   * Waits for the post-register redirect to land on /tradesman/jobs
   * (the new swipe-deck home for tradespeople) AND for the deck's
   * root testid to be visible. The whole chain (Firebase createUser
   * → photo upload → PUT /api/tradesmen/me → router.replace → Next.js
   * page mount) can take several seconds on a cold worker, so a
   * generous timeout is preferable to a short URL poll that flakes
   * under CI load.
   */
  async expectLandedOnTradesmanJobs() {
    await expect(this.page).toHaveURL(/\/tradesman\/jobs/, {
      timeout: 30_000,
    });
    await expect(
      this.page.getByTestId("tradesman-jobs-deck"),
    ).toBeVisible({ timeout: 30_000 });
  }

  /**
   * Assert that the Step 4 password checklist is showing a given rule
   * as either passing (green / emerald) or failing (zinc).
   */
  async assertChecklistRule(label: string, pass: boolean) {
    const item = this.passwordChecklist
      .locator("li", { hasText: label })
      .first();
    await expect(item).toBeVisible();
    if (pass) {
      await expect(item).toHaveClass(/text-emerald-600/);
    } else {
      await expect(item).toHaveClass(/text-zinc-400/);
    }
  }

  async fillPhone(value: string) {
    await this.phoneInput.fill(value);
  }

  async fillServiceAreaQuery(query: string) {
    await this.areasInput.fill(query);
  }

  async expectFieldError(
    field: "companyName" | "contactName" | "email" | "phone" | "serviceAreas",
    message: string | RegExp,
  ) {
    await expect(
      this.page
        .locator('[role="alert"]')
        .filter({ hasText: message })
        .first(),
    ).toBeVisible({ timeout: 5_000 });
  }

  async expectFieldErrorCleared(message: string | RegExp) {
    await expect(
      this.page.locator('[role="alert"]').filter({ hasText: message }),
    ).toHaveCount(0);
  }

  async expectChipVisible(label: string) {
    await expect(
      this.page.locator(`[aria-label="Remove ${label}"]`),
    ).toBeVisible({ timeout: 5_000 });
  }

  async expectChipRemoved(label: string) {
    await expect(
      this.page.locator(`[aria-label="Remove ${label}"]`),
    ).toHaveCount(0);
  }

  async expectServicePreview(text: string | RegExp) {
    await expect(
      this.page.getByTestId("service-areas-preview"),
    ).toContainText(text);
  }

  async selectBoroughByName(query: string, fullBoroughName: string) {
    await this.areasInput.fill(query);
    await this.page.getByTestId(`borough-option-${fullBoroughName}`).click();
    await this.expectChipVisible(fullBoroughName);
  }

  async expectNoTopBanner() {
    await expect(
      this.page.getByText(/Please complete all required fields/i),
    ).toHaveCount(0);
  }

  async tryContinueFromStep1() {
    await this.nextButton.click();
  }

  /**
   * Walk the wizard from a fresh /tradesman/register-tradesmen state through
   * Steps 1 → 4 using the data from a Tradesman model. Caller is responsible
   * for ensuring guest auth state and any postcode mocking is in place
   * before calling.
   */
  async walkToAccountStep(tradesman: Tradesman) {
    await this.goto();

    await this.fillStep1({
      companyName: tradesman.companyName,
      contactName: tradesman.contactName ?? "Test Contact",
      email: tradesman.requiredEmail,
    });
    await this.addServiceArea(tradesman.requiredServiceAreaPostcode);
    await this.goToStep2();

    await this.selectTradeType(tradesman.requiredPrimaryTradeLabel);
    await this.goToStep3();

    await this.goToStep4();
  }
}

export default TradesmanRegisterPage;
