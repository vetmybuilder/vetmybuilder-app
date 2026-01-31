import { expect, type Locator, type Page } from "@playwright/test";

export class HomePage {
  readonly page: Page;

  readonly header: Locator;

  constructor(page: Page) {
    this.page = page;
    this.header = page.getByRole("banner", { name: "Site header" });
  }

  async goto() {
    await this.page.goto("/");
    await expect(this.header).toBeVisible();
  }
}

export default HomePage;
