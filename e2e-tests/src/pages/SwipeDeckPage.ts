import { expect, type Locator, type Page } from "@playwright/test";

export class SwipeDeckPage {
  readonly page: Page;

  readonly topCard: Locator;
  readonly likeButton: Locator;
  readonly passButton: Locator;
  readonly infoButton: Locator;
  readonly topTradespersonChip: Locator;
  readonly recentCompletedBand: Locator;
  readonly photoLightbox: Locator;

  constructor(page: Page) {
    this.page = page;
    this.topCard = page.getByTestId("swipe-top-card").filter({ visible: true });
    this.likeButton = page
      .getByRole("button", { name: "Like" })
      .filter({ visible: true });
    this.passButton = page
      .getByRole("button", { name: "Pass" })
      .filter({ visible: true });
    this.infoButton = page
      .getByRole("button", { name: "View details" })
      .filter({ visible: true });
    this.topTradespersonChip = page
      .getByTestId("card-top-tradesperson")
      .filter({ visible: true });
    this.recentCompletedBand = page
      .getByTestId("card-recent-completed-band")
      .filter({ visible: true });
    this.photoLightbox = page.getByTestId("photo-lightbox");
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

  async flipCard(): Promise<void> {
    await expect(this.infoButton).toBeEnabled({ timeout: 10_000 });
    await this.infoButton.click();
  }

  async showsTopTradespersonChip(): Promise<void> {
    await expect(this.topTradespersonChip).toBeVisible({ timeout: 10_000 });
    await expect(this.topTradespersonChip).toHaveText(/Top tradesperson/i);
  }

  async showsRecentCompletedBandFor(area: string): Promise<void> {
    await expect(this.recentCompletedBand).toBeVisible({ timeout: 10_000 });
    await expect(this.recentCompletedBand).toContainText(
      new RegExp(`Recently completed in ${area}`, "i"),
    );
  }

  async tapRecentCompletedBand(): Promise<void> {
    await expect(this.recentCompletedBand).toBeVisible({ timeout: 10_000 });
    await this.recentCompletedBand.click();
  }

  async showsLightbox(): Promise<void> {
    await expect(this.photoLightbox).toBeVisible({ timeout: 10_000 });
  }

  /**
   * When the builder has a boosted closure but no closure photos, the
   * band renders as a non-interactive <div> (data-band-static="1") and
   * tapping it must NOT open the lightbox.
   */
  async recentCompletedBandIsStatic(): Promise<void> {
    await expect(this.recentCompletedBand).toBeVisible({ timeout: 10_000 });
    await expect(this.recentCompletedBand).toHaveAttribute(
      "data-band-static",
      "1",
    );
  }

  async lightboxIsClosed(): Promise<void> {
    await expect(this.photoLightbox).toHaveCount(0);
  }
}

export default SwipeDeckPage;
