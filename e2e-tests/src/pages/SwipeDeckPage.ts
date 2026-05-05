import { expect, type Locator, type Page } from "@playwright/test";

export class SwipeDeckPage {
  readonly page: Page;

  readonly topCard: Locator;
  readonly likeButton: Locator;
  readonly passButton: Locator;
  readonly infoButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.topCard = page
      .getByTestId("swipe-top-card")
      .filter({ visible: true });
    this.likeButton = page
      .getByRole("button", { name: "Like" })
      .filter({ visible: true });
    this.passButton = page
      .getByRole("button", { name: "Pass" })
      .filter({ visible: true });
    this.infoButton = page
      .getByRole("button", { name: "Info" })
      .filter({ visible: true });
  }

  async visitForProject(projectId: string | number): Promise<void> {
    await this.page.goto(`/projects/${projectId}`, {
      waitUntil: "domcontentloaded",
    });
  }

  async hasRenderedDeck(): Promise<void> {
    await expect(this.likeButton).toBeVisible({ timeout: 15_000 });
    await expect(this.passButton).toBeVisible();
    await expect(this.topCard).toHaveCount(1, { timeout: 15_000 });
  }

  async tapLike(): Promise<void> {
    await expect(this.likeButton).toBeEnabled({ timeout: 10_000 });
    await this.likeButton.click();
  }

  async tapPass(): Promise<void> {
    await expect(this.passButton).toBeEnabled({ timeout: 10_000 });
    await this.passButton.click();
  }
}

export default SwipeDeckPage;
