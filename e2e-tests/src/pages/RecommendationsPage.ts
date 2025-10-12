import { expect, Locator, Page } from "@playwright/test";

export type ExpectedRecommendation = {
  company: string;
  rating: number; // 0..5
  likes: number; // integer
  comment?: string;
  label?: "community" | "friend";
  recommenderName?: string;
  email?: string;
  phone?: string;
  hasGallery?: boolean;
};

export class RecommendationsPage {
  readonly page: Page;

  // Header
  readonly heading: Locator;
  readonly headingBand: Locator;
  readonly backBtn: Locator;

  // List & cards
  readonly list: Locator;
  readonly cards: Locator;

  // Pager
  readonly pager: Locator;
  readonly pagerPrev: Locator;
  readonly pagerNext: Locator;
  readonly pagerStatus: Locator;
  readonly pagerPage: Locator;
  readonly pagerPages: Locator;
  readonly pagerTotal: Locator;

  constructor(page: Page) {
    this.page = page;

    // Header
    this.heading = page.getByTestId("recommendations-title");
    this.headingBand = page.getByTestId("heading-band");
    this.backBtn = page.getByTestId("back-to-project");

    // List & cards
    this.list = page.getByTestId("recommendations-list");
    this.cards = page.getByTestId("recommendation-card");

    // Pager
    this.pager = page.getByTestId("pager");
    this.pagerPrev = page.getByTestId("pager-prev");
    this.pagerNext = page.getByTestId("pager-next");
    this.pagerStatus = page.getByTestId("pager-status");
    this.pagerPage = page.getByTestId("pager-page");
    this.pagerPages = page.getByTestId("pager-pages");
    this.pagerTotal = page.getByTestId("pager-total");
  }

  /**
   * Header checks only.
   */
  async hasHeading(projectTitle: string) {
    await expect(this.heading).toBeVisible();
    await expect(this.headingBand).toContainText(
      "The top recommendations, ranked by the community."
    );

    const expectedTitle = `All recommendations · ${projectTitle}`;
    await expect(this.heading).toHaveText(expectedTitle);

    await expect(this.backBtn).toBeVisible();
    await expect(this.backBtn).toHaveAttribute(
      "aria-label",
      "Back to project details"
    );

    const href = await this.backBtn.getAttribute("href");
    expect.soft(href, "back link should be present").toBeTruthy();
    if (href) {
      expect
        .soft(
          /\/projects\/\d+$/.test(href),
          `back link href looked odd: ${href}`
        )
        .toBeTruthy();
    }
  }

  /**
   * - Pass an ordered array and we assert each card in order
   * - Also validates pager numbers and that total >= expected.length
   */
  async hasRecommendations(expected: ExpectedRecommendation[]) {
    // We should have at least as many cards as we're asserting
    const renderedCount = await this.cards.count();
    expect
      .soft(renderedCount, "rendered cards should be >= expected")
      .toBeGreaterThanOrEqual(expected.length);

    // Validate each expected item against the corresponding card (ordered)
    for (const [i, exp] of expected.entries()) {
      const card = this.cards.nth(i);

      // company
      await expect
        .soft(card.getByTestId("rec-company"))
        .toHaveText(exp.company);

      // likes: prefer the top count (owner view), fall back to side count (non-owner)
      const topLikes = card.getByTestId("rec-like-count-top");
      const sideLikes = card.getByTestId("rec-like-count");
      const likesLocator = (await topLikes.isVisible()) ? topLikes : sideLikes;
      await expect.soft(likesLocator).toHaveText(String(exp.likes));

      // rating via aria-label on star container: "<n> out of 5"
      const stars = card.getByTestId("rec-stars");
      await expect
        .soft(stars)
        .toHaveAttribute(
          "aria-label",
          new RegExp(`^${exp.rating}\\s+out\\s+of\\s+5$`)
        );

      // comment (optional)
      if (typeof exp.comment === "string" && exp.comment.length > 0) {
        await expect
          .soft(card.getByTestId("rec-comment"))
          .toHaveText(exp.comment);
      }

      // label -> badge presence
      if (exp.label === "community") {
        await expect
          .soft(card.getByTestId("rec-badge-community"))
          .toBeVisible();
      } else if (exp.label === "friend") {
        await expect.soft(card.getByTestId("rec-badge-friend")).toBeVisible();
      }

      // gallery badge
      if (exp.hasGallery === true) {
        await expect.soft(card.getByTestId("rec-badge-photos")).toBeVisible();
      } else {
        await expect
          .soft(card.getByTestId("rec-badge-photos"))
          .not.toBeVisible();
      }

      // meta: includes name/email/phone concatenated; assert presence of provided pieces
      const meta = await card.getByTestId("rec-meta").innerText();
      if (exp.recommenderName) expect.soft(meta).toContain(exp.recommenderName);
      if (exp.email) expect.soft(meta).toContain(exp.email);
      if (exp.phone) expect.soft(meta).toContain(exp.phone);

      // created date present
      await expect.soft(card.getByTestId("rec-created")).toBeVisible();
    }

    // Pager sanity
    const pageNum = parseInt(await this.pagerPage.innerText(), 10);
    const pagesNum = parseInt(await this.pagerPages.innerText(), 10);
    const totalNum = parseInt(await this.pagerTotal.innerText(), 10);

    expect.soft(Number.isFinite(pageNum)).toBeTruthy();
    expect.soft(Number.isFinite(pagesNum)).toBeTruthy();
    expect.soft(Number.isFinite(totalNum)).toBeTruthy();
    expect.soft(pageNum).toBeGreaterThanOrEqual(1);
    expect.soft(pageNum).toBeLessThanOrEqual(pagesNum);
    expect.soft(totalNum).toBeGreaterThanOrEqual(expected.length);
  }
}
