// e2e-tests/src/pages/HomePage.ts
import { Page, Locator, expect } from "@playwright/test";
import { BasePage } from "./BasePage";

export class HomePage extends BasePage {
  readonly signInButton: Locator;
  readonly getStartedLink: Locator;

  constructor(page: Page) {
    super(page);
    this.signInButton = page.getByTestId("nav-sign-in");
    this.getStartedLink = page.getByRole("link", { name: "Get started" });
  }

  async goto() {
    await this.page.goto("/");
  }

  async expectLoaded() {
    // Adjust if your homepage has a different stable element to assert
    await expect(this.page).toHaveURL("/");
  }
}
