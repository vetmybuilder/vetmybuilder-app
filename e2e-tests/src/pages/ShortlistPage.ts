import { expect, type Locator, type Page } from "@playwright/test";

export class ShortlistPage {
  readonly page: Page;

  readonly container: Locator;
  readonly title: Locator;
  readonly recommendationsList: Locator;
  readonly voteButton: Locator;
  readonly voteCount: Locator;

  constructor(page: Page) {
    this.page = page;

    this.container = page.getByTestId("recommendations-page");
    this.title = page.getByTestId("recommendations-title");
    this.recommendationsList = page.getByTestId("recommendations-list");
    this.voteButton = page.getByTestId("rec-vote-button").first();
    this.voteCount = page.getByTestId("rec-vote-count").first();
  }

  async visit(projectId: string | number): Promise<void> {
    const url = `/projects/${projectId}/shortlist`;
    try {
      await this.page.goto(url, { waitUntil: "domcontentloaded" });
    } catch (error) {
      const message = String(error);
      if (message.includes("WebKit encountered an internal error")) {
        // WebKit can crash on first navigation under resource pressure; retry once.
        await this.page.goto(url, { waitUntil: "domcontentloaded" });
      } else {
        throw error;
      }
    }
    await expect(this.container).toBeVisible({ timeout: 15_000 });
  }

  async hasRecommendations(): Promise<void> {
    await expect(this.recommendationsList).toBeVisible({ timeout: 30_000 });
  }

  async vote(): Promise<void> {
    await expect(this.voteButton).toBeVisible({ timeout: 15_000 });
    await expect(this.voteButton).toBeEnabled();
    await this.voteButton.click();
  }

  async hasVoteCount(count: number): Promise<void> {
    await expect(this.voteCount).toHaveText(String(count), { timeout: 10_000 });
  }
}

export default ShortlistPage;
