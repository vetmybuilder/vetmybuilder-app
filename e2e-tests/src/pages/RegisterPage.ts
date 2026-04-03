import { expect, type Locator, type Page } from "@playwright/test";
import Account, { type RegisterInput } from "../models/Account";

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
    this.location = page.getByLabel("Postcode or City/Borough", {
      exact: true,
    });

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
    this.signInLink = page.getByTestId("register-form").getByRole("link", { name: "Sign in" });
  }

  async goto(): Promise<void> {
    // /signup is a guest-only page; ensure we're logged out before navigating
    await this.page.goto("/logout", { waitUntil: "domcontentloaded" });
    await this.page
      .waitForURL(/signedOut=1/, { timeout: 15_000 })
      .catch(() => {});
    await this.page.goto("/signup");
    await expect(this.form).toBeVisible({ timeout: 15_000 });
  }

  async fill(input: RegisterInput): Promise<void> {
    await this.firstName.fill(input.firstName);
    await this.lastName.fill(input.lastName);

    if (input.username) await this.username.fill(input.username);

    await this.email.fill(input.email);
    await this.password.fill(input.password);
    await this.location.fill(input.location);
  }

  async fillFromAccount(account: Account): Promise<void> {
    await this.fill(account.toRegisterInput());
  }

  async submit(): Promise<void> {
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

  async hasAlert(text: string): Promise<void> {
    await expect(this.errorAlert).toContainText(text);
  }

  async hasWeakPasswordError(): Promise<void> {
    await this.hasAlert("Your password is too weak. Try a longer password.");
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
      await expect(this.firstName).toHaveClass(/border-red-600/);
    }

    if (errors.lastName) {
      await expect(this.lastNameError).toHaveText(errors.lastName);
      await expect(this.lastName).toHaveClass(/border-red-600/);
    }

    if (errors.username) {
      await expect(this.usernameError).toHaveText(errors.username);
      await expect(this.username).toHaveClass(/border-red-600/);
    }

    if (errors.email) {
      await expect(this.emailError).toHaveText(errors.email);
      await expect(this.email).toHaveClass(/border-red-600/);
    }

    if (errors.password) {
      await expect(this.passwordError).toHaveText(errors.password);
      await expect(this.password).toHaveClass(/border-red-600/);
    }

    if (errors.location) {
      await expect(this.locationError).toHaveText(errors.location);
      await expect(this.location).toHaveClass(/border-red-600/);
    }
  }
}

export default RegisterPage;
