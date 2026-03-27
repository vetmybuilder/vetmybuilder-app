import { expect, type Locator, type Page } from "@playwright/test";

export class ShortlistPage {
  readonly page: Page;

  readonly container: Locator;
  readonly title: Locator;
  readonly recommendationsList: Locator;

  constructor(page: Page) {
    this.page = page;

    this.container = page.getByTestId("recommendations-page");
    this.title = page.getByTestId("recommendations-title");
    this.recommendationsList = page.getByTestId("recommendations-list");
  }

  async visit(projectId: string | number): Promise<void> {
    await this.page.goto(`/projects/${projectId}/shortlist`, {
      waitUntil: "domcontentloaded",
    });
    await expect(this.container).toBeVisible({ timeout: 15_000 });
  }

  async hasRecommendations(): Promise<void> {
    await expect(this.recommendationsList).toBeVisible({ timeout: 15_000 });
  }
}

export default ShortlistPage;
