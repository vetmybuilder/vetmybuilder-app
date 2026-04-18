import { expect, type Locator, type Page } from "@playwright/test";

export class HomePage {
  readonly page: Page;

  readonly header: Locator;
  readonly heroCta: Locator;
  readonly myProjectsLink: Locator;

  constructor(page: Page) {
    this.page = page;
    this.header = page.getByRole("banner", { name: "Site header" });
    this.heroCta = page.getByTestId("hero-cta");
    this.myProjectsLink = page.getByRole("link", { name: "My Projects" });
  }

  async goto() {
    await this.page.goto("/");
    await expect(this.header).toBeVisible();
  }

  async expectHeroCtaVisible(text: string | RegExp) {
    await expect(this.heroCta).toBeVisible({ timeout: 15_000 });
    await expect(this.heroCta).toHaveText(text);
  }

  async expectHeroCtaHref(href: string) {
    await expect(this.heroCta).toHaveAttribute("href", href);
  }

  async expectMyProjectsLinkVisible() {
    await expect(this.myProjectsLink).toBeVisible();
    await expect(this.myProjectsLink).toHaveAttribute("href", "/projects");
  }
}

export default HomePage;
