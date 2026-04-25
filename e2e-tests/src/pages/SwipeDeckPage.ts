// e2e-tests/src/pages/SwipeDeckPage.ts
//
// Page object for the mobile swipe deck rendered on the homeowner's
// /projects/:id/shortlist page. Encapsulates all locators so specs never
// need to know the testids or the shape of SwipeActionBar.

import { expect, type Locator, type Page } from "@playwright/test";

export class SwipeDeckPage {
  readonly page: Page;

  readonly topCard: Locator;
  readonly likeButton: Locator;
  readonly passButton: Locator;
  readonly infoButton: Locator;

  constructor(page: Page) {
    this.page = page;

    // The SwipeDeck renders the top card with data-testid="swipe-top-card"
    // and the SwipeActionBar exposes buttons by accessible name.
    this.topCard = page.getByTestId("swipe-top-card");
    this.likeButton = page.getByRole("button", { name: "Like" });
    this.passButton = page.getByRole("button", { name: "Pass" });
    this.infoButton = page.getByRole("button", { name: "Info" });
  }

  async visitForProject(projectId: string | number): Promise<void> {
    const url = `/projects/${projectId}/shortlist`;
    await this.page.goto(url, { waitUntil: "domcontentloaded" });
  }

  /** The swipe deck only renders on mobile breakpoints. */
  async hasRenderedDeck(): Promise<void> {
    await expect(this.topCard).toBeVisible({ timeout: 15_000 });
    await expect(this.likeButton).toBeVisible();
    await expect(this.passButton).toBeVisible();
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
