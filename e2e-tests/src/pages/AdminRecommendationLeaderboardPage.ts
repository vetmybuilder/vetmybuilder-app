import { expect, type Locator, type Page } from "@playwright/test";
import BasePage from "./BasePage";

export class AdminRecommendationLeaderboardPage extends BasePage {
  readonly heading: Locator;
  readonly searchInput: Locator;
  readonly clearButton: Locator;
  readonly forbiddenMessage: Locator;
  readonly emptyMessage: Locator;

  constructor(page: Page) {
    super(page);

    this.heading = page.getByRole("heading", {
      name: "Recommendation Leaderboard",
    });
    this.searchInput = page.getByTestId("rec-filter-q");
    this.clearButton = page.getByTestId("rec-btn-clear");
    this.forbiddenMessage = page.getByTestId("forbidden-message");
    this.emptyMessage = page.getByText("No results.");
  }

  async visit() {
    await this.page.goto("/admin/recommendation-leaderboard", {
      waitUntil: "domcontentloaded",
    });
  }

  async waitUntilReady() {
    await expect(this.heading).toBeVisible({ timeout: 30_000 });
    // Wait for the loading indicator to clear (AdminGate + data fetch both show "Loading…")
    await expect(this.page.getByText("Loading…")).not.toBeVisible({
      timeout: 15_000,
    });
  }

  async searchFor(query: string) {
    await expect(this.searchInput).toBeVisible();
    await this.searchInput.fill(query);
  }

  async clearSearch() {
    await expect(this.clearButton).toBeVisible();
    await this.clearButton.click();
  }
}

export default AdminRecommendationLeaderboardPage;
