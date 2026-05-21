import { expect, type Locator, type Page } from "@playwright/test";
import BasePage from "./BasePage";
import { safeGoto } from "../helpers/navigation";

// Page object for /tradesman/register-tradesmen - the LEAN landing
// page. The 4-step inline wizard that used to live here is gone; all
// company detail collection happens on /tradesman/signup/complete
// (see TradesmanSignupCompletePage). The only job of this page is to
// authenticate the trader via Google or email + password.

export class TradesmanRegisterPage extends BasePage {
  readonly googleButton: Locator;
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly confirmInput: Locator;
  readonly betaCodeInput: Locator;
  readonly submitButton: Locator;
  readonly signInLink: Locator;
  readonly passwordChecklist: Locator;

  constructor(page: Page) {
    super(page);
    this.googleButton = page.getByTestId("google-signin-button");
    this.emailInput = page.getByTestId("signup-email");
    this.passwordInput = page.getByTestId("signup-password");
    this.confirmInput = page.getByTestId("signup-confirm");
    this.betaCodeInput = page.getByTestId("signup-beta-code");
    this.submitButton = page.getByTestId("signup-submit");
    this.signInLink = page.getByTestId("link-vendor-signin");
    this.passwordChecklist = page.getByTestId("password-checklist");
  }

  async goto() {
    await safeGoto(this.page, "/tradesman/register-tradesmen");
    await expect(this.page.getByTestId("tradesman-register-page")).toBeVisible(
      { timeout: 15_000 },
    );
  }

  /* ---------- expectations ---------- */

  async expectLandingVisible() {
    await expect(this.page.getByTestId("tradesman-register-page")).toBeVisible(
      { timeout: 15_000 },
    );
  }

  async expectGoogleButtonVisible() {
    await expect(this.googleButton).toBeVisible();
  }

  async expectEmailFormVisible() {
    await expect(this.emailInput).toBeVisible();
    await expect(this.passwordInput).toBeVisible();
    await expect(this.confirmInput).toBeVisible();
    await expect(this.submitButton).toBeVisible();
  }

  async expectSignInLink() {
    await expect(this.signInLink).toBeVisible();
  }

  async expectSignInHref(href: string) {
    await expect(this.signInLink).toHaveAttribute("href", href);
  }

  async expectPasswordChecklistVisible() {
    await expect(this.passwordChecklist).toBeVisible({ timeout: 5_000 });
  }

  async expectPasswordError(matcher: RegExp) {
    // The page renders pwErr in a <p role="alert"> right under the
    // password / confirm input. Match by role + text so we don't have
    // to hardcode the wrapper element.
    await expect(this.page.getByRole("alert").filter({ hasText: matcher }))
      .toBeVisible({ timeout: 5_000 });
  }

  /* ---------- actions ---------- */

  async fillEmail(email: string) {
    await this.emailInput.fill(email);
  }

  async fillPassword(password: string) {
    await this.passwordInput.fill(password);
  }

  async fillConfirmPassword(password: string) {
    await this.confirmInput.fill(password);
  }

  async fillBetaCode(code: string) {
    await this.betaCodeInput.fill(code);
  }

  async submitEmailSignup() {
    await this.submitButton.click();
  }
}

export default TradesmanRegisterPage;
