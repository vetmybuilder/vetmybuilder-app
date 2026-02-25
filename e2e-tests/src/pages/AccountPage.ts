import { expect, type Locator, type Page } from "@playwright/test";
import type SiteHeader from "./SiteHeader";

export type AccountValues = {
  firstName: string;
  lastName: string;
  email: string;
  username: string;
  location: string;
};

export type AccountFieldErrors = {
  firstName?: string;
  lastName?: string;
  username?: string;
  location?: string;
};

type AccountEditableValues = Omit<AccountValues, "email">;

export class AccountPage {
  readonly page: Page;

  readonly title: Locator;
  readonly form: Locator;
  readonly card: Locator;

  readonly firstName: Locator;
  readonly lastName: Locator;
  readonly email: Locator;
  readonly username: Locator;
  readonly location: Locator;

  readonly saveButton: Locator;

  readonly successAlert: Locator;
  readonly errorAlert: Locator;
  readonly loadingText: Locator;

  constructor(page: Page) {
    this.page = page;

    this.title = page.getByRole("heading", { name: "Manage account" });
    this.form = page.locator("form");
    this.card = page.locator(".card").first();
    this.firstName = page.locator("#acc-first");
    this.lastName = page.locator("#acc-last");
    this.email = page.locator("#acc-email");
    this.username = page.locator("#acc-username");
    this.location = page.locator("#acc-location");

    this.saveButton = page.getByRole("button", { name: "Save changes" });

    this.successAlert = this.card.locator('[role="status"]');
    this.errorAlert = this.card.locator('[role="alert"]');

    this.loadingText = page.getByText("Loading…");
  }

  async visit() {
    await this.page.goto("/account");
    await expect(this.page).toHaveURL("/account");
    await expect(this.form).toBeVisible();
    // await this.waitUntilReady();
  }

  async waitUntilReady() {
    await expect(this.title).toBeVisible();

    if (await this.loadingText.count()) {
      await expect(this.loadingText).toBeHidden();
    }

    await expect(this.form).toBeVisible();
    await expect(this.username).toBeVisible();
    await expect(this.saveButton).toBeVisible();
  }

  async assertEmailDisabled() {
    await this.waitUntilReady();
    await expect(this.email).toBeDisabled();
  }

  async editAccountDetails(
    siteHeader: SiteHeader,
    updated: AccountEditableValues,
  ) {
    await siteHeader.goToEditAccount();
    await this.waitUntilReady();
    await this.assertEmailDisabled();

    const emailBefore = await this.email.inputValue();

    await this.firstName.fill(updated.firstName);
    await this.lastName.fill(updated.lastName);
    await this.username.fill(updated.username);
    await this.location.fill(updated.location);

    await this.saveChanges();

    return { emailBefore };
  }

  async saveChanges() {
    await this.waitUntilReady();
    await this.saveButton.click();
    await expect(this.successAlert).toHaveText("Details updated. Redirecting…");
  }

  async hasAccountDetails(expected: AccountValues) {
    await this.waitUntilReady();

    await expect(this.firstName).toHaveValue(expected.firstName);
    await expect(this.lastName).toHaveValue(expected.lastName);
    await expect(this.email).toHaveValue(expected.email);
    await expect(this.username).toHaveValue(expected.username);
    await expect(this.location).toHaveValue(expected.location);
  }

  async hasAccountFieldErrors(expected: AccountFieldErrors) {
    await this.waitUntilReady();
    await expect(this.errorAlert).toBeVisible();

    if (expected.firstName) {
      await expect(this.firstName).toHaveAttribute("aria-invalid", "true");
      await expect(this.errorAlert).toContainText(expected.firstName);
    }
    if (expected.lastName) {
      await expect(this.lastName).toHaveAttribute("aria-invalid", "true");
      await expect(this.errorAlert).toContainText(expected.lastName);
    }
    if (expected.username) {
      await expect(this.username).toHaveAttribute("aria-invalid", "true");
      await expect(this.errorAlert).toContainText(expected.username);
    }
    if (expected.location) {
      await expect(this.location).toHaveAttribute("aria-invalid", "true");
      await expect(this.errorAlert).toContainText(expected.location);
    }
  }

  async changeUsername(username: string) {
    await this.waitUntilReady();
    await this.username.fill(username);
    await this.saveButton.click();
  }
}

export default AccountPage;
