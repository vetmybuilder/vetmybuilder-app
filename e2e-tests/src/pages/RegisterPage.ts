import { expect, type Locator, type Page } from "@playwright/test";
import Account, { type RegisterInput } from "../models/Account";

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

  readonly createAccountButton: Locator;
  readonly error: Locator;
  readonly signInLink: Locator;

  constructor(page: Page) {
    this.page = page;

    this.title = page.getByRole("heading", { name: "Create account" });
    this.form = page.getByRole("form", { name: "Create account form" });

    this.firstName = page.getByLabel("First name", { exact: true });
    this.lastName = page.getByLabel("Last name", { exact: true });
    this.username = page.getByLabel(/^Username/i);
    this.email = page.getByLabel("Email", { exact: true });
    this.password = page.getByLabel("Password", { exact: true });
    this.location = page.getByLabel(/Postcode or City\/Borough/i);

    this.createAccountButton = page.getByRole("button", {
      name: "Create account",
    });

    this.error = page.getByRole("alert");
    this.signInLink = page.getByRole("link", { name: "Sign in" });
  }

  async fill(input: RegisterInput) {
    await this.firstName.fill(input.firstName);
    await this.lastName.fill(input.lastName);

    if (input.username) {
      await this.username.fill(input.username);
    }

    await this.email.fill(input.email);
    await this.password.fill(input.password);
    await this.location.fill(input.location);
  }

  async fillFromAccount(account: Account) {
    await this.fill(account.toRegisterInput());
  }

  async submit() {
    await this.createAccountButton.click();
  }

  async signUp(account: Account) {
    await this.page.goto("/signup");

    await expect(this.title).toBeVisible();
    await this.fillFromAccount(account);

    const signupResPromise = this.page
      .waitForResponse(
        (res) =>
          res.request().method() === "POST" &&
          res.url().includes("/api/auth/signup"),
      )
      .catch(() => null);

    await this.submit();

    const res = await signupResPromise;

    if (res && !res.ok()) {
      let body = "";
      try {
        body = await res.text();
      } catch {}
      throw new Error(`POST /api/auth/signup failed: ${res.status()} ${body}`);
    }

    await expect(this.page).toHaveURL("/projects");
  }
}

export default RegisterPage;
