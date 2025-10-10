import { Page, Locator, expect } from "@playwright/test";

export type RegisterData = {
  firstName: string;
  lastName: string;
  username?: string;
  email: string;
  password: string;
  postcode: string;
};

export class RegisterPage {
  readonly page: Page;
  readonly heading: Locator;

  readonly firstName: Locator;
  readonly lastName: Locator;
  readonly username: Locator;
  readonly email: Locator;
  readonly password: Locator;
  readonly postcode: Locator;

  readonly submit: Locator;
  readonly errorAlert: Locator;
  readonly signInLink: Locator;

  constructor(page: Page) {
    this.page = page;

    this.heading = page.getByRole("heading", {
      name: /create account/i,
      level: 1,
    });

    this.firstName = page.getByLabel('first name')
    this.lastName = page.getByLabel('last name');
    this.username = page.getByLabel('username');
    this.email = page.getByLabel('email');
    this.password = page.getByLabel('password');
    this.postcode = page.getByLabel('postcode');

    this.submit = page.getByRole("button", { name: /create account/i });
    this.errorAlert = page.getByRole("alert");
    this.signInLink = page.getByRole("link", { name: /sign in/i });
  }

  async goto() {
    await this.page.goto("/register");
  }

  async expectLoaded() {
    await expect(this.heading).toBeVisible();
    await expect(this.submit).toBeEnabled();
  }

  async fill(data: RegisterData) {
    await this.firstName.fill(data.firstName);
    await this.lastName.fill(data.lastName);
    if (data.username !== undefined) {
      await this.username.fill(data.username);
    }
    await this.email.fill(data.email);
    await this.password.fill(data.password);
    await this.password.fill(data.password);
    await this.postcode.fill(data.postcode);
  }

  async submitForm() {
    await this.submit.click();
  }

  async signUp(data: RegisterData) {
    await this.expectLoaded();
    await this.fill(data);
    await this.submitForm();
  }

  // async expectSuccess() {
  //   // Your register page routes to /projects on success
  //   await expect(this.page).toHaveURL(/\/projects\b/);
  //   // No error alert should be present
  //   await expect(this.errorAlert).toHaveCount(0);
  // }

  async expectErrorContains(text: RegExp | string) {
    await expect(this.errorAlert).toBeVisible();
    await expect(this.errorAlert).toContainText(text);
  }
}
