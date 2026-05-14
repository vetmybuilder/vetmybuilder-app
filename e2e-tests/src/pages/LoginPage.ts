import { Page, Locator, expect } from "@playwright/test";
import { safeGoto } from "../helpers/navigation";

export class LoginPage {
  readonly page: Page;

  // Page / container
  readonly loginPage: Locator;
  readonly loginCard: Locator;
  readonly title: Locator;

  // Form
  readonly form: Locator;
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly submitButton: Locator;
  readonly errorMessage: Locator;

  // Links
  readonly createOneLink: Locator;

  constructor(page: Page) {
    this.page = page;

    // Containers
    this.loginPage = page.getByTestId("login-page");
    this.loginCard = page.getByTestId("login-card");
    this.title = page.getByTestId("login-title");

    // Form + inputs
    this.form = page.getByTestId("login-form");
    this.emailInput = page.getByTestId("input-login-email");
    this.passwordInput = page.getByTestId("input-login-password");
    this.submitButton = page.getByTestId("btn-login");
    this.errorMessage = page.getByTestId("login-error");

    // Links
    this.createOneLink = page.getByTestId("link-to-register");
  }

  async goto(next?: string) {
    // /login is a guest-only page; ensure we're logged out before
    // navigating. /logout deliberately fires window.location.replace to
    // /?signedOut=1, which interrupts the goto() promise on WebKit.
    // Swallow the interruption - waitForURL below confirms we landed.
    await this.page
      .goto("/logout", { waitUntil: "domcontentloaded" })
      .catch(() => {});
    await this.page
      .waitForURL(/signedOut=1/, { timeout: 15_000 })
      .catch(() => {});

    const url = next ? `/login?next=${encodeURIComponent(next)}` : "/login";
    await safeGoto(this.page, url);
    await expect(this.loginPage).toBeVisible({ timeout: 15_000 });
  }

  async login(email: string, password: string) {
    await this.goto();
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.submitButton.click();
  }

  // Use this variant when a successful login is expected. It waits for the
  // post-login redirect so Firebase auth state is persisted before any
  // subsequent navigation or API calls in the test.
  async loginExpectSuccess(email: string, password: string) {
    await this.login(email, password);
    await expect(this.page).not.toHaveURL(/\/login/, { timeout: 15_000 });
    // Wait for the new user's Firebase auth state to fully settle in
    // IndexedDB. Without this a subsequent page.goto can fire while
    // auth.currentUser is still null (mobile WebKit re-hydration is
    // slow), which triggers a 401 from the api interceptor and the
    // page redirects away (e.g. /projects/X -> /projects or /404).
    await this.page
      .waitForFunction(
        (expectedEmail) => {
          const w = window as any;
          const auth =
            w?.firebaseAuth ||
            w?.auth ||
            (typeof w?.firebase?.auth === "function" ? w.firebase.auth() : null);
          const user = auth?.currentUser;
          if (!user) return false;
          if (!expectedEmail) return true;
          return (user.email || "").toLowerCase() === expectedEmail.toLowerCase();
        },
        email,
        { timeout: 15_000 },
      )
      .catch(() => {
        /* Best-effort: not every page exposes `firebaseAuth` on window,
           and the URL check above already confirms the form submission
           succeeded. */
      });
  }

  async loginWith(email: string, password: string) {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
    await this.submitButton.click();
  }

  async hasError() {
    await expect(this.errorMessage).toBeVisible({ timeout: 10_000 });
  }

  async hasErrorMessage(text: string) {
    await expect(this.errorMessage).toBeVisible({ timeout: 10_000 });
    await expect(this.errorMessage).toContainText(text);
  }

  async clickCreateOneLink(): Promise<void> {
    await expect(this.createOneLink).toBeVisible();
    await this.createOneLink.click();
  }

  async hasVendorSignupLink(): Promise<void> {
    await expect(this.createOneLink).toHaveAttribute(
      "href",
      "/tradesman/register-tradesmen",
    );
  }

  /** Navigate to the trade-facing login form (next=/tradesman/jobs). */
  async gotoTradeForm() {
    await this.goto("/tradesman/jobs");
  }

  /**
   * Assert the role-mismatch error is visible and that the inline link
   * points to the correct login page for the other role.
   */
  async hasRoleError(variant: "not-trade" | "not-homeowner") {
    await expect(this.errorMessage).toBeVisible({ timeout: 15_000 });

    if (variant === "not-trade") {
      await expect(this.errorMessage).toContainText("not a trade account");
      await expect(
        this.errorMessage.getByRole("link"),
      ).toHaveAttribute("href", "/login");
    } else {
      await expect(this.errorMessage).toContainText("trade account");
      await expect(
        this.errorMessage.getByRole("link"),
      ).toHaveAttribute("href", "/tradesman/login");
    }
  }
}
