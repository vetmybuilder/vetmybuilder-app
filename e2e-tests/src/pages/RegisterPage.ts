import { expect, type Locator, type Page } from "@playwright/test";
import { safeGoto } from "../helpers/navigation";
import Account, { type RegisterInput } from "../models/Account";
import EmulatorIdpWidgetPage from "./EmulatorIdpWidgetPage";

type OAuthProviderName = "google" | "facebook";

const OAUTH_BUTTON_TESTID: Record<OAuthProviderName, string> = {
  google: "google-signin-button",
  facebook: "facebook-signin-button",
};

const OAUTH_PROVIDER_LABEL: Record<OAuthProviderName, string> = {
  google: "Google.com",
  facebook: "Facebook.com",
};

type FieldKey =
  | "firstName"
  | "lastName"
  | "username"
  | "email"
  | "password"
  | "location";

type FieldErrors = Partial<Record<FieldKey, string>>;

export class RegisterPage {
  readonly page: Page;

  readonly title: Locator;
  readonly form: Locator;

  readonly firstName: Locator;
  readonly lastName: Locator;
  readonly username: Locator;
  readonly email: Locator;
  readonly password: Locator;
  readonly confirmPassword: Locator;
  readonly location: Locator;

  readonly firstNameError: Locator;
  readonly lastNameError: Locator;
  readonly usernameError: Locator;
  readonly emailError: Locator;
  readonly passwordError: Locator;
  readonly locationError: Locator;

  readonly formError: Locator;

  readonly createAccountButton: Locator;
  readonly submitButton: Locator;

  readonly errorAlert: Locator;
  readonly signInLink: Locator;

  readonly googleSignInButton: Locator;
  readonly facebookSignInButton: Locator;

  constructor(page: Page) {
    this.page = page;

    this.title = page.getByRole("heading", { name: "Create account" });
    this.form = page.getByTestId("register-form");

    // Inputs (labels come from RegisterField)
    this.firstName = page.getByLabel("First name", { exact: true });
    this.lastName = page.getByLabel("Last name", { exact: true });
    this.username = page.getByLabel("Username", { exact: true });
    this.email = page.getByLabel("Email", { exact: true });
    this.password = page.getByLabel("Password", { exact: true });
    this.confirmPassword = page.getByLabel("Confirm password", { exact: true });
    // Label was renamed "Postcode or City/Borough" -> "Your area" in
    // the homeowner-signup form refresh. The input is still the same
    // LocationField (data-testid="reg-reg-loc" on the wrapping div,
    // id="reg-loc" on the input itself).
    this.location = page.getByLabel("Your area", { exact: true });

    this.firstNameError = page.getByTestId("reg-reg-fn-error");
    this.lastNameError = page.getByTestId("reg-reg-ln-error");
    this.usernameError = page.getByTestId("reg-reg-un-error");
    this.emailError = page.getByTestId("reg-reg-email-error");
    this.passwordError = page.getByTestId("reg-reg-pass-error");
    this.locationError = page.getByTestId("reg-reg-loc-error");

    this.formError = page.getByTestId("register-error");

    this.createAccountButton = page.getByRole("button", {
      name: "Create account",
    });
    this.submitButton = this.createAccountButton;

    this.errorAlert = page.getByTestId("register-error");
    // Sign-in link now lives ABOVE the form (next to the Google SSO
    // button, mirroring the trade signup pattern). Look it up by its
    // dedicated testid rather than scoping to the form.
    this.signInLink = page.getByTestId("signup-signin-link");

    this.googleSignInButton = page.getByTestId(OAUTH_BUTTON_TESTID.google);
    this.facebookSignInButton = page.getByTestId(OAUTH_BUTTON_TESTID.facebook);
  }

  async goto(): Promise<void> {
    // /signup is a guest-only page; ensure we're logged out before navigating
    await this.page.goto("/logout", { waitUntil: "domcontentloaded" });
    await this.page
      .waitForURL(/signedOut=1/, { timeout: 15_000 })
      .catch(() => {});
    // Wait for the home page to finish loading so the /logout page's deferred
    // window.location.replace cannot interrupt the next navigation on WebKit.
    await this.page
      .waitForLoadState("load", { timeout: 10_000 })
      .catch(() => {});
    await safeGoto(this.page, "/signup");
    await expect(this.form).toBeVisible({ timeout: 15_000 });
  }

  async fill(input: RegisterInput): Promise<void> {
    await this.firstName.fill(input.firstName);
    await this.lastName.fill(input.lastName);

    if (input.username) await this.username.fill(input.username);

    await this.email.fill(input.email);
    await this.password.fill(input.password);
    await this.confirmPassword.fill(input.password);
    await this.location.fill(input.location);
    // Dismiss the postcode autocomplete dropdown so it doesn't block submit.
    // hasInteracted is reset in the Escape handler so the in-flight async
    // fetch cannot re-open the dropdown after we dismiss it.
    await this.location.press("Escape");
    await this.page
      .locator('[role="listbox"]')
      .waitFor({ state: "hidden", timeout: 3_000 })
      .catch(() => {});
  }

  async fillFromAccount(account: Account): Promise<void> {
    await this.fill(account.toRegisterInput());
  }

  async agreeToTerms(): Promise<void> {
    await this.page.getByTestId("agree-terms").locator("input[type='checkbox']").check();
  }

  async submit(): Promise<void> {
    await this.agreeToTerms();
    await expect(this.submitButton).toBeVisible();
    await expect(this.submitButton).toBeEnabled();
    await this.submitButton.click();
  }

  async signUp(account: Account): Promise<void> {
    await this.goto();
    await this.fillFromAccount(account);
    await this.submit();
    await this.page.waitForURL("/projects");
  }

  /**
   * Click "Continue with Google/Facebook" on /signup, drive the Firebase
   * Auth emulator's IDP popup widget to create a fresh fake account, and
   * wait for the popup to close. After this resolves the main tab is
   * Firebase-authed and the auth context will (a) bounce mid-signup users
   * to /signup/complete or (b) land returning users on /projects.
   *
   * Hides ALL the popup-window choreography (waitForEvent("page"),
   * waitForEvent("close"), per-provider button + heading selectors) so the
   * spec stays free of locators and Playwright internals.
   */
  async signInAsNewOAuthAccount(
    provider: OAuthProviderName,
    input: { email: string; displayName: string },
  ): Promise<void> {
    const button =
      provider === "google" ? this.googleSignInButton : this.facebookSignInButton;
    await expect(button).toBeVisible();

    // Set up the popup listener BEFORE clicking, so we don't miss the event
    // on slow CI runs.
    const popupPromise = this.page.context().waitForEvent("page");
    await button.click();
    const popup = await popupPromise;

    const widget = new EmulatorIdpWidgetPage(
      popup,
      OAUTH_PROVIDER_LABEL[provider],
    );
    await widget.signInAsNewAccount(input);
  }

  async hasAlert(text: string): Promise<void> {
    await expect(this.errorAlert).toContainText(text);
  }

  async hasWeakPasswordError(): Promise<void> {
    // Strong-password validation now runs client-side, so we assert against
    // the password field error rather than a Firebase auth alert.
    await expect(this.passwordError).toContainText(
      "Password must be at least 8 characters and include uppercase, lowercase, a number, and a symbol.",
    );
  }

  async navigateToLogin(): Promise<void> {
    await expect(this.signInLink).toBeVisible();
    await this.signInLink.click();
    await expect(this.page).toHaveURL("/login?next=%2Fprojects", { timeout: 20_000 });
  }

  async hasFieldErrors(errors: FieldErrors): Promise<void> {
    await expect(this.formError).toHaveText(
      "Please fill in all required fields.",
    );

    if (errors.firstName) {
      await expect(this.firstNameError).toHaveText(errors.firstName);
      await expect(this.firstName).toHaveClass(/border-red-500/);
    }

    if (errors.lastName) {
      await expect(this.lastNameError).toHaveText(errors.lastName);
      await expect(this.lastName).toHaveClass(/border-red-500/);
    }

    if (errors.username) {
      await expect(this.usernameError).toHaveText(errors.username);
      await expect(this.username).toHaveClass(/border-red-500/);
    }

    if (errors.email) {
      await expect(this.emailError).toHaveText(errors.email);
      await expect(this.email).toHaveClass(/border-red-500/);
    }

    if (errors.password) {
      await expect(this.passwordError).toHaveText(errors.password);
      await expect(this.password).toHaveClass(/border-red-500/);
    }

    if (errors.location) {
      await expect(this.locationError).toHaveText(errors.location);
      await expect(this.location).toHaveClass(/border-red-500/);
    }
  }
}

export default RegisterPage;
