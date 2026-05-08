import { expect, type Locator, type Page } from "@playwright/test";
import BasePage from "./BasePage";

/**
 * /tradesman/jobs/list - the browse list view of jobs a tradesman can
 * pitch. Each row is a JobListRow keyed by projectId. Rows the
 * tradesman doesn't strongly match are dimmed (opacity-65). A chip row
 * filters the list (All / Within 5 mi / £15k+ / My trades / New today).
 *
 * Companion to TradesmanJobsDeckPage. Both screens render the same
 * underlying jobs queue but in different shapes; the list view's main
 * affordance is "Open in deck →" which routes to /tradesman/jobs with
 * a focus query so the deck centres that card.
 */
export class TradesmanJobsListPage extends BasePage {
  readonly root: Locator;
  readonly chipAll: Locator;
  readonly chipMyTrades: Locator;

  constructor(page: Page) {
    super(page);
    this.root = page.getByTestId("tradesman-jobs-list");
    this.chipAll = page.getByTestId("chip-all");
    this.chipMyTrades = page.getByTestId("chip-my-trades");
  }

  async goto(): Promise<void> {
    await this.page.goto("/tradesman/jobs/list", {
      waitUntil: "domcontentloaded",
    });
    await expect(this.root).toBeVisible({ timeout: 20_000 });
  }

  rowLocator(projectId: number | string): Locator {
    return this.page.getByTestId(`job-list-row-${projectId}`);
  }

  openInDeckLocator(projectId: number | string): Locator {
    return this.page.getByTestId(`open-in-deck-${projectId}`);
  }

  async expectRowVisible(projectId: number | string): Promise<void> {
    await expect(this.rowLocator(projectId)).toBeVisible({ timeout: 15_000 });
  }

  async expectRowHidden(projectId: number | string): Promise<void> {
    await expect(this.rowLocator(projectId)).toHaveCount(0);
  }

  async expectRowsVisible(projectIds: Array<number | string>): Promise<void> {
    for (const id of projectIds) {
      await this.expectRowVisible(id);
    }
  }

  /** Low-score rows (aiScore < 60) get opacity-65 to dim them. */
  async expectRowDimmed(projectId: number | string): Promise<void> {
    await expect(this.rowLocator(projectId)).toHaveClass(/opacity-65/);
  }

  async expectRowNotDimmed(projectId: number | string): Promise<void> {
    await expect(this.rowLocator(projectId)).not.toHaveClass(/opacity-65/);
  }

  async tapMyTradesChip(): Promise<void> {
    await this.chipMyTrades.click();
  }

  async tapAllChip(): Promise<void> {
    await this.chipAll.click();
  }

  async tapOpenInDeck(projectId: number | string): Promise<void> {
    const btn = this.openInDeckLocator(projectId);
    await expect(btn).toBeEnabled({ timeout: 10_000 });
    await btn.click();
  }

  /**
   * Privacy guard: a tradesman browsing the list must NOT see contact
   * or messaging affordances on a row before they've matched. The
   * row's only forward action is "Open in deck →".
   */
  async expectNoContactOrMessageButtons(): Promise<void> {
    await expect(
      this.page.getByRole("button", { name: /contact|message/i }),
    ).toHaveCount(0);
    await expect(
      this.page.getByRole("link", { name: /contact|message/i }),
    ).toHaveCount(0);
  }

  async expectFocusedDeckUrl(projectId: number | string): Promise<void> {
    await expect(this.page).toHaveURL(
      new RegExp(`/tradesman/jobs\\?focus=${projectId}\\b`),
    );
  }
}

export default TradesmanJobsListPage;
