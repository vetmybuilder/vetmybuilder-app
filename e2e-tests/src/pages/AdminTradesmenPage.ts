import { expect, type Locator, type Page } from "@playwright/test";
import BasePage from "./BasePage";
import type { TradesmanStatus } from "../types/tradesman";

// Re-exported for backwards compatibility with existing imports.
// Prefer importing from "../types/tradesman" directly in new code.
export type { TradesmanStatus };

export class AdminTradesmenPage extends BasePage {
  readonly heading: Locator;
  readonly searchInput: Locator;
  readonly statusFilter: Locator;
  readonly applyButton: Locator;
  readonly emptyMessage: Locator;
  readonly adminsOnlyError: Locator;

  constructor(page: Page) {
    super(page);

    this.heading = page.getByRole("heading", { name: "Admin — Tradesmen" });
    this.searchInput = page.getByTestId("filter-q");
    this.statusFilter = page.getByTestId("filter-status");
    this.applyButton = page.getByTestId("btn-apply");
    this.emptyMessage = page.getByText("No tradesmen.");
    this.adminsOnlyError = page.getByText("Admins only.");
  }

  async waitUntilReady() {
    await expect(
      this.page.getByTestId("admin-tradesmen-page"),
    ).toBeVisible({ timeout: 30_000 });
    await expect(this.heading).toBeVisible({ timeout: 15_000 });
    // Wait for Firebase auth to resolve so canQuery=true and load() runs.
    // The table wrapper only renders when user && !loading, so this confirms
    // auth is established before any data assertions.
    await expect(
      this.page.getByTestId("admin-tradesmen-table"),
    ).toBeVisible({ timeout: 30_000 });
    // Wait for initial data load to complete (button returns to "Apply" when !busy)
    await expect(this.applyButton).toHaveText("Apply", { timeout: 15_000 });
  }

  async visit() {
    await this.page.goto("/admin/tradesmen", {
      waitUntil: "domcontentloaded",
    });
    await this.waitUntilReady();
  }

  async searchFor(query: string) {
    await expect(this.searchInput).toBeVisible();
    await this.searchInput.fill(query);
    await this.applyButton.click();
  }

  async filterByStatus(status: "all" | TradesmanStatus) {
    await expect(this.statusFilter).toBeVisible();
    await this.statusFilter.selectOption(status);
    await this.applyButton.click();
  }

  getStatusBadge(userId: string): Locator {
    return this.page.getByTestId(`tradesman-status-${userId}`);
  }

  getMakeActiveButton(userId: string): Locator {
    return this.page.getByTestId(`make-active-${userId}`);
  }

  getMakeInactiveButton(userId: string): Locator {
    return this.page.getByTestId(`make-inactive-${userId}`);
  }

  getMakeDraftButton(userId: string): Locator {
    return this.page.getByTestId(`make-draft-${userId}`);
  }

  async assertStatus(userId: string, status: TradesmanStatus) {
    await expect(this.getStatusBadge(userId)).toHaveText(status, {
      timeout: 15_000,
    });
  }

  async assertRowVisible(userId: string) {
    await expect(this.getStatusBadge(userId)).toBeVisible({ timeout: 30_000 });
  }

  async hasTradesmenCount(expected: number) {
    await expect(
      this.page.locator('[data-testid^="tradesman-status-"]'),
    ).toHaveCount(expected, { timeout: 15_000 });
  }

  async makeInactive(userId: string) {
    const btn = this.getMakeInactiveButton(userId);
    await expect(btn).toBeVisible();
    await expect(btn).toBeEnabled();

    const [response] = await Promise.all([
      this.page.waitForResponse(
        (res) =>
          res.url().includes(`/api/admin/tradesmen/${userId}/status`),
        { timeout: 15_000 },
      ),
      btn.click(),
    ]);

    if (!response.ok()) {
      const body = await response.text().catch(() => "");
      throw new Error(
        `makeInactive returned ${response.status()}: ${body}`,
      );
    }
  }

  async makeActive(userId: string) {
    const btn = this.getMakeActiveButton(userId);
    await expect(btn).toBeVisible();
    await expect(btn).toBeEnabled();

    const [response] = await Promise.all([
      this.page.waitForResponse(
        (res) =>
          res.url().includes(`/api/admin/tradesmen/${userId}/status`),
        { timeout: 15_000 },
      ),
      btn.click(),
    ]);

    if (!response.ok()) {
      const body = await response.text().catch(() => "");
      throw new Error(
        `makeActive returned ${response.status()}: ${body}`,
      );
    }
  }

  async makeDraft(userId: string) {
    const btn = this.getMakeDraftButton(userId);
    await expect(btn).toBeVisible();
    await expect(btn).toBeEnabled();

    const [response] = await Promise.all([
      this.page.waitForResponse(
        (res) =>
          res.url().includes(`/api/admin/tradesmen/${userId}/status`),
        { timeout: 15_000 },
      ),
      btn.click(),
    ]);

    if (!response.ok()) {
      const body = await response.text().catch(() => "");
      throw new Error(
        `makeDraft returned ${response.status()}: ${body}`,
      );
    }
  }
}

export default AdminTradesmenPage;
