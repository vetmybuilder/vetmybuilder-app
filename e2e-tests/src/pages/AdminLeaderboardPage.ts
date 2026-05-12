import { expect, type Locator, type Page } from "@playwright/test";
import BasePage from "./BasePage";
import type { TradesmanStatus } from "../types/tradesman";

// Re-exported for backwards compatibility with existing imports.
// Prefer importing from "../types/tradesman" directly in new code.
export type { TradesmanStatus };

export class AdminLeaderboardPage extends BasePage {
  readonly heading: Locator;
  readonly searchInput: Locator;
  readonly forbiddenMessage: Locator;

  constructor(page: Page) {
    super(page);

    // Heading copy is case-flexible: the redesign moved from
    // "Tradesmen Leaderboard" to "Tradesmen leaderboard".
    this.heading = page.getByRole("heading", {
      name: /tradesmen leaderboard/i,
    });
    // The leaderboard redesign replaced the dedicated search box +
    // "Search" button with a debounced filter input. Typing into it
    // updates the URL/state automatically; there is no submit button.
    this.searchInput = page.getByTestId("filter-q");
    this.forbiddenMessage = page.getByText("Access restricted");
  }

  /** Waits for the admin-authenticated view (heading visible). Call after visit() for admin tests. */
  async waitUntilReady() {
    await expect(this.page.getByTestId("admin-leaderboard-page")).toBeVisible({
      timeout: 30_000,
    });
    await expect(this.heading).toBeVisible({ timeout: 15_000 });
  }

  /** Navigates to the leaderboard and waits for the page container only.
   *  Works for both admin and non-admin users. */
  async visit() {
    await this.page.goto("/admin/tradesmen-leaderboard", {
      waitUntil: "domcontentloaded",
    });
    await expect(this.page.getByTestId("admin-leaderboard-page")).toBeVisible({
      timeout: 30_000,
    });
  }

  async searchFor(query: string) {
    await expect(this.searchInput).toBeVisible();
    await this.searchInput.fill(query);
    // The input is debounced (~250ms) before re-firing the leaderboard
    // fetch. Give it a beat so subsequent assertions don't race the
    // pre-debounce render.
    await this.page.waitForTimeout(500);
  }

  getRow(userId: string): Locator {
    return this.page.getByTestId(`tradesman-row-${userId}`);
  }

  async assertRowVisible(userId: string) {
    await expect
      .poll(
        async () => {
          const visible = await this.getRow(userId).isVisible().catch(() => false);
          if (visible) return true;
          // Reload page and re-search to pick up newly inserted data
          const query = await this.searchInput.inputValue().catch(() => "");
          await this.page.reload({ waitUntil: "domcontentloaded" });
          await this.waitUntilReady();
          if (query) {
            await this.searchInput.fill(query);
            await this.page.waitForTimeout(500);
          }
          await this.page.waitForTimeout(1500);
          return this.getRow(userId).isVisible().catch(() => false);
        },
        { timeout: 40_000, intervals: [3000] },
      )
      .toBe(true);
  }

  async hasStatus(userId: string, status: TradesmanStatus) {
    await expect(
      this.page.getByTestId(`tradesman-status-${userId}`),
    ).toHaveText(status, { timeout: 15_000 });
  }

  /** Open the right-hand detail drawer for a given user. */
  async openRowDrawer(userId: string) {
    const viewBtn = this.page.getByTestId(`tradesman-row-view-${userId}`);
    await expect(viewBtn).toBeVisible({ timeout: 15_000 });
    await viewBtn.click();
    await expect(this.page.getByTestId("tradesman-detail-drawer")).toBeVisible({
      timeout: 15_000,
    });
  }

  /** Apply a status change via the drawer Manage tab and wait for the
   *  server response. The old inline "Actions ▾" menu is gone; status
   *  changes now happen inside `TradesmanManageTab`. */
  async setStatus(userId: string, status: TradesmanStatus): Promise<void> {
    await this.openRowDrawer(userId);
    await this.page.getByTestId("drawer-tab-manage").click();
    await expect(this.page.getByTestId("drawer-manage")).toBeVisible({
      timeout: 10_000,
    });

    const statusBtn = this.page.getByTestId(`manage-status-${status}`);
    await expect(statusBtn).toBeVisible({ timeout: 10_000 });

    const [response] = await Promise.all([
      this.page.waitForResponse(
        (res) => res.url().includes(`/api/admin/tradesmen/${userId}/status`),
        { timeout: 20_000 },
      ),
      statusBtn.click(),
    ]);

    if (!response.ok()) {
      const body = await response.text().catch(() => "");
      throw new Error(
        `Admin status update returned ${response.status()}: ${body}`,
      );
    }
  }
}

export default AdminLeaderboardPage;
