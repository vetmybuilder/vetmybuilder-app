import { expect, type Locator, type Page } from "@playwright/test";
import BasePage from "./BasePage";

export class TradesmanJobsListPage extends BasePage {
  readonly root: Locator;
  readonly chipAll: Locator;
  readonly chipMyTrades: Locator;

  constructor(page: Page) {
    super(page);

    this.root = page
      .getByTestId("tradesman-jobs-list")
      .filter({ visible: true });
    this.chipAll = page.getByTestId("chip-all").filter({ visible: true });
    this.chipMyTrades = page
      .getByTestId("chip-my-trades")
      .filter({ visible: true });
  }

  async goto(): Promise<void> {
    await this.page.goto("/tradesman/jobs", { waitUntil: "domcontentloaded" });

    const isMobile = (this.page.viewportSize()?.width ?? 1440) < 768;
    if (isMobile) {
      await this.page.getByRole("button", { name: /more options/i }).click();
      await this.page.getByTestId("mobile-menu-trades-jobs-list").click();
    } else {
      await this.page.getByTestId("trades-menu-button").click();
      await this.page.getByTestId("menu-jobs").click();
    }

    await expect(this.root).toBeVisible({ timeout: 20_000 });
  }

  rowLocator(projectId: number | string): Locator {
    return this.page
      .getByTestId(`job-list-row-${projectId}`)
      .filter({ visible: true });
  }

  openInDeckLocator(projectId: number | string): Locator {
    return this.page
      .getByTestId(`open-in-deck-${projectId}`)
      .filter({ visible: true });
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
    // Scope to rows. The global header has a "Messages" icon for
    // signed-in tradespeople which is intentional chrome; the privacy
    // concern is per-row contact affordances on the list itself.
    const rows = this.page
      .locator('[data-testid^="job-list-row-"]')
      .filter({ visible: true });
    await expect(
      rows.getByRole("button", { name: /contact|message/i }),
    ).toHaveCount(0);
    await expect(
      rows.getByRole("link", { name: /contact|message/i }),
    ).toHaveCount(0);
  }

  async expectFocusedDeckUrl(projectId: number | string): Promise<void> {
    await expect(this.page).toHaveURL(
      new RegExp(`/tradesman/jobs\\?focus=${projectId}\\b`),
    );
  }
}

export default TradesmanJobsListPage;
