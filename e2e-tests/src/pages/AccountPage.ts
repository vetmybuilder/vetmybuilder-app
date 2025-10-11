// e2e-tests/src/pages/AccountPage.ts
import { expect, Page, Locator } from "@playwright/test";

export type AccountDetails = {
  firstName: string;
  lastName: string;
  username: string;
  location: string;
};

export class AccountPage {
  constructor(public page: Page) {}

  firstName: Locator = this.page.getByLabel("First name");
  lastName: Locator = this.page.getByLabel("Last name");
  email: Locator = this.page.getByLabel("Email");
  username: Locator = this.page.getByLabel("Username");
  location: Locator = this.page.getByLabel("Location (postcode or city)");
  saveBtn: Locator = this.page.getByRole("button", { name: "Save changes" });
  successBanner: Locator = this.page.getByTestId("account-alert-success");
  errorsBanner: Locator = this.page.getByTestId("account-alert-error");

  async waitForLoaded() {
    await expect(this.firstName).toBeVisible();
  }

  async fillAccountDetails(
    d: AccountDetails,
    opts?: { expectedEmail?: string }
  ) {
    await this.waitForLoaded();
    await this.firstName.fill(d.firstName);
    await this.lastName.fill(d.lastName);
    await this.username.fill(d.username);
    await this.location.fill(d.location);
    await expect(this.email).toBeDisabled();
    if (opts?.expectedEmail) {
      await expect(this.email).toHaveValue(opts.expectedEmail);
    }
    await this.saveBtn.click();
  }

  async hasSuccessMessage() {
    await expect(this.successBanner).toHaveText(
      "Details updated. Redirecting…"
    );
  }

  async hasErrorMessage() {
    await expect(this.errorsBanner).toHaveText(
      "That username is already taken."
    );
  }

  async assertValues(d: AccountDetails) {
    await expect(this.firstName).toHaveValue(d.firstName);
    await expect(this.lastName).toHaveValue(d.lastName);
    await expect(this.username).toHaveValue(d.username);
    await expect(this.location).toHaveValue(d.location);
  }
}
