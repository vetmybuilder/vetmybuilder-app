import { expect, type Locator, type Page } from "@playwright/test";
import BasePage from "./BasePage";

/**
 * /tradesman/jobs - the swipe deck a tradesman uses to "pitch" jobs.
 * Wraps JobSwipeDeck (top card + Pass/Info/Like action bar).
 */
export class TradesmanJobsDeckPage extends BasePage {
  readonly root: Locator;
  readonly topCard: Locator;
  readonly likeButton: Locator;
  readonly passButton: Locator;
  readonly infoButton: Locator;
  readonly emptyHeading: Locator;

  constructor(page: Page) {
    super(page);
    this.root = page.getByTestId("tradesman-jobs-deck");
    this.topCard = page.getByTestId("job-swipe-top-card");
    this.likeButton = page.getByRole("button", { name: "Like" });
    this.passButton = page.getByRole("button", { name: "Pass" });
    this.infoButton = page.getByRole("button", { name: "View details" });
    this.emptyHeading = page.getByRole("heading", {
      name: /You're all caught up|No jobs posted yet/i,
    });
  }

  async goto(): Promise<void> {
    await this.page.goto("/tradesman/jobs", { waitUntil: "domcontentloaded" });
    await expect(this.root).toBeVisible({ timeout: 20_000 });
  }

  async expectTopCardShowing(jobTitle: string): Promise<void> {
    await expect(this.topCard).toBeVisible({ timeout: 15_000 });
    await expect(this.topCard).toContainText(jobTitle);
  }

  async tapLike(): Promise<void> {
    await expect(this.likeButton).toBeEnabled({ timeout: 10_000 });
    await this.likeButton.click();
  }

  async tapPass(): Promise<void> {
    await expect(this.passButton).toBeEnabled({ timeout: 10_000 });
    await this.passButton.click();
  }

  async expectDeckEmpty(): Promise<void> {
    await expect(this.emptyHeading).toBeVisible({ timeout: 10_000 });
  }
}

export default TradesmanJobsDeckPage;
