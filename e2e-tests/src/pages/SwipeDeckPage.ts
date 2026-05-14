import { expect, type Locator, type Page } from "@playwright/test";

export type BuilderCardDetails = {
  company: string;
  rating?: number;
  reviewCount?: number;
  yearsTrading?: number;
  verified?: boolean;
  tier?: "recommended" | "ai-matched";
  recommenderName?: string;
  topTradesperson?: boolean;
  recentlyCompletedIn?: string;
};

export class SwipeDeckPage {
  readonly page: Page;

  readonly topCard: Locator;
  readonly likeButton: Locator;
  readonly passButton: Locator;
  readonly infoButton: Locator;
  readonly photoLightbox: Locator;
  readonly allCaughtUpHeading: Locator;

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
    this.photoLightbox = page.getByTestId("photo-lightbox");
    this.allCaughtUpHeading = page
      .getByRole("heading", { name: "You're all caught up" })
      .filter({ visible: true });
  }

  async visitForProject(projectId: string | number): Promise<void> {
    await this.page.goto(`/projects/${projectId}`, {
      waitUntil: "domcontentloaded",
    });
    // Mobile WebKit can race the api interceptor's Bearer attach against
    // the project fetch on first paint - server returns 401, the page's
    // error-redirect effect fires, we land on /404. The retry covers the
    // small window before Firebase auth finishes hydrating in IndexedDB.
    if (/\/404/.test(this.page.url())) {
      await this.page.waitForTimeout(500);
      await this.page.goto(`/projects/${projectId}`, {
        waitUntil: "domcontentloaded",
      });
    }
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

  /**
   * Drag the top card horizontally past the 25% commit threshold. The
   * SwipeDeck component reads pointer events directly, so we drive the
   * full pointer-down / move / up sequence with steps so velocity is
   * registered the same way it would be from a real finger drag.
   */
  async dragTopCardRight(): Promise<void> {
    await this.dragTopCard("right");
  }

  async dragTopCardLeft(): Promise<void> {
    await this.dragTopCard("left");
  }

  private async dragTopCard(direction: "left" | "right"): Promise<void> {
    await expect(this.topCard).toBeVisible({ timeout: 10_000 });
    const box = await this.topCard.boundingBox();
    if (!box) {
      throw new Error("dragTopCard: top card has no bounding box");
    }

    const startX = box.x + box.width / 2;
    const startY = box.y + box.height / 2;
    // 35% of width sits comfortably past the 25% commit threshold in
    // SwipeDeck. Anything less and the card springs back to centre.
    const offsetX = box.width * 0.35;
    const endX = direction === "right" ? startX + offsetX : startX - offsetX;

    await this.page.mouse.move(startX, startY);
    await this.page.mouse.down();
    // Multiple intermediate moves so SwipeDeck's velocity tracker sees
    // a non-zero px/ms reading - a single hop reads as a teleport and
    // can land below the flick threshold even when distance is fine.
    await this.page.mouse.move(endX, startY, { steps: 12 });
    await this.page.mouse.up();
  }

  async flipCard(): Promise<void> {
    await expect(this.infoButton).toBeEnabled({ timeout: 10_000 });
    await this.infoButton.click();
  }

  async tapRecentCompletedBand(): Promise<void> {
    const band = this.topCard
      .getByTestId("card-recent-completed-band")
      .first();
    await expect(band).toBeVisible({ timeout: 10_000 });
    await band.click();
  }

  async showsLightbox(): Promise<void> {
    await expect(this.photoLightbox).toBeVisible({ timeout: 10_000 });
  }

  async lightboxIsClosed(): Promise<void> {
    await expect(this.photoLightbox).toHaveCount(0);
  }

  /**
   * After swiping the final candidate the deck advances to its empty
   * state. Used by drag/tap tests to confirm the card actually flew off
   * and the next-card slot resolved (rather than the card springing
   * back, which is the failure mode when the commit threshold wasn't
   * cleared).
   */
  async showsAllCaughtUp(): Promise<void> {
    await expect(this.allCaughtUpHeading).toBeVisible({ timeout: 10_000 });
  }

  async readTopCardCompany(): Promise<string> {
    const heading = this.topCard.getByRole("heading").first();
    await expect(heading).toBeVisible({ timeout: 10_000 });
    return (await heading.textContent())?.trim() ?? "";
  }

  /**
   * Asserts every detail BuilderCard renders for the tradesperson on
   * the front of the top card. Only fields set on `details` are
   * checked; everything else is ignored, so callers pass exactly the
   * fields their scenario seeds.
   *
   * All assertions are scoped to the top card filtered by company name
   * so peek cards stacked behind the top card don't double-match.
   */
  async hasBuilderCardDetails(details: BuilderCardDetails): Promise<void> {
    // Wait for the top card itself to mount before filtering by text.
    // Filtering-by-text immediately means "0 matches" if the card hasn't
    // rendered yet, which produces a confusing "element not found"
    // error. Splitting the wait gives a clearer signal: "top card never
    // rendered" vs "top card text is wrong".
    await expect(this.topCard).toBeVisible({ timeout: 15_000 });
    await expect(this.topCard).toContainText(details.company, {
      timeout: 15_000,
    });
    const card = this.topCard.filter({ hasText: details.company });

    if (details.rating !== undefined) {
      await expect(card).toContainText(
        new RegExp(`★\\s*${details.rating.toFixed(1)}`),
      );
    }
    if (details.reviewCount !== undefined) {
      await expect(card).toContainText(`${details.reviewCount} reviews`);
    }
    if (details.yearsTrading !== undefined) {
      const label =
        details.yearsTrading === 1 ? "1 yr" : `${details.yearsTrading} yrs`;
      await expect(card).toContainText(label);
    }
    if (details.verified) {
      await expect(card).toContainText(/Verified/i);
    }
    if (details.tier === "recommended") {
      await expect(card).toContainText(/Recommendation/i);
    }
    if (details.tier === "ai-matched") {
      await expect(card).toContainText(/AI match/i);
    }
    if (details.recommenderName) {
      await expect(card).toContainText(
        new RegExp(`Recommended by ${details.recommenderName}`, "i"),
      );
    }
    if (details.topTradesperson) {
      const chip = card.getByTestId("card-top-tradesperson");
      await expect(chip.first()).toBeVisible({ timeout: 10_000 });
      await expect(chip.first()).toHaveText(/Top tradesperson/i);
    }
    if (details.recentlyCompletedIn) {
      const band = card.getByTestId("card-recent-completed-band").first();
      await expect(band).toBeVisible({ timeout: 10_000 });
      await expect(band).toContainText(
        new RegExp(`Recently completed in ${details.recentlyCompletedIn}`, "i"),
      );
    }
  }

  /**
   * When the builder has a boosted closure but no closure photos the
   * band still renders, but as a non-interactive <div>
   * (data-band-static="1"). Tapping it must NOT open the lightbox.
   */
  async recentCompletedBandIsStatic(): Promise<void> {
    const band = this.topCard
      .getByTestId("card-recent-completed-band")
      .first();
    await expect(band).toBeVisible({ timeout: 10_000 });
    await expect(band).toHaveAttribute("data-band-static", "1");
  }
}

export default SwipeDeckPage;
