import { expect, type Locator, type Page } from "@playwright/test";
import BasePage from "./BasePage";

export type JobCardDetails = {
  title: string;
  type?: string;
  outward?: string;
  aiSummary?: string;
  aiMatchBadge?: boolean;
  property?: string;
  postedLabel?: boolean;
  keyConcerns?: string[];
  matchedTrades?: string[];
  unmatchedTrades?: string[];
};

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
    // Mobile WebKit can race the Bearer attach against the first deck
    // fetch — the request goes out without a token, server treats the
    // tradesman as unactivated, deck returns empty, and the page renders
    // "No jobs posted yet" sticky. Reload once if the empty heading is
    // visible immediately after mount: by then auth has fully hydrated.
    const emptyShowing = await this.emptyHeading.isVisible().catch(() => false);
    if (emptyShowing) {
      await this.page.reload({ waitUntil: "domcontentloaded" });
      await expect(this.root).toBeVisible({ timeout: 20_000 });
    }
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

  async flipCard(): Promise<void> {
    await expect(this.infoButton).toBeEnabled({ timeout: 10_000 });
    await this.infoButton.click();
  }

  /**
   * Asserts every detail JobCard + JobCardBack surface for the job on
   * the top card. The card auto-flips inside this method when any
   * back-of-card field is requested (keyConcerns / property /
   * postedLabel / matchedTrades / unmatchedTrades), so callers don't
   * have to coordinate flip vs assert.
   *
   * Only fields set on `details` are checked.
   */
  async hasJobCardDetails(details: JobCardDetails): Promise<void> {
    // Wait for the top card itself to mount before filtering by text.
    // Filtering-by-text immediately means "0 matches" if the card hasn't
    // rendered yet, which produces a confusing "element not found"
    // error. Splitting the wait gives a clearer signal: "top card never
    // rendered" vs "top card title is wrong".
    await expect(this.topCard).toBeVisible({ timeout: 15_000 });
    await expect(this.topCard).toContainText(details.title, {
      timeout: 15_000,
    });
    const card = this.topCard.filter({ hasText: details.title });

    if (details.type) {
      await expect(card).toContainText(details.type);
    }
    if (details.outward) {
      await expect(card).toContainText(details.outward);
    }
    if (details.aiSummary) {
      await expect(card).toContainText(details.aiSummary, { timeout: 10_000 });
    }
    if (details.aiMatchBadge) {
      await expect(card).toContainText(/%\s*match/i);
    }

    const needsBack =
      !!details.property ||
      details.postedLabel ||
      (details.keyConcerns && details.keyConcerns.length > 0) ||
      (details.matchedTrades && details.matchedTrades.length > 0) ||
      (details.unmatchedTrades && details.unmatchedTrades.length > 0);

    if (needsBack) {
      await this.flipCard();
    }

    if (details.property) {
      await expect(card).toContainText(details.property);
    }
    if (details.postedLabel) {
      await expect(card).toContainText(/Posted:/i);
    }
    for (const concern of details.keyConcerns ?? []) {
      await expect(card).toContainText(concern);
    }
    for (const trade of details.matchedTrades ?? []) {
      await expect(card).toContainText(`${trade} ✓`);
    }
    for (const trade of details.unmatchedTrades ?? []) {
      await expect(card).toContainText(trade);
      await expect(card).not.toContainText(`${trade} ✓`);
    }
  }
}

export default TradesmanJobsDeckPage;
