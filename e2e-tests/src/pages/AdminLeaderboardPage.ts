import { expect, type Locator, type Page } from "@playwright/test";
import BasePage from "./BasePage";

export type TradesmanStatus = "draft" | "active" | "inactive";

export class AdminLeaderboardPage extends BasePage {
  readonly heading: Locator;
  readonly searchInput: Locator;
  readonly searchButton: Locator;
  readonly forbiddenMessage: Locator;

  constructor(page: Page) {
    super(page);

    this.heading = page.getByRole("heading", {
      name: "Tradesmen Leaderboard (Admin)",
    });
    this.searchInput = page.getByTestId("admin-search-input");
    this.searchButton = page.getByRole("button", { name: "Search" });
    this.forbiddenMessage = page.getByText("Access restricted");
  }

  async waitUntilReady() {
    await expect(
      this.page.getByTestId("admin-leaderboard-page"),
    ).toBeVisible({ timeout: 30_000 });
    await expect(this.heading).toBeVisible({ timeout: 15_000 });
  }

  async visit() {
    await this.page.goto("/admin/tradesmen-leaderboard", {
      waitUntil: "domcontentloaded",
    });
    await this.waitUntilReady();
  }

  async searchFor(query: string) {
    await expect(this.searchInput).toBeVisible();
    await this.searchInput.fill(query);
    await this.searchButton.click();
  }

  getRow(userId: string): Locator {
    return this.page.getByTestId(`row-${userId}`);
  }

  async assertRowVisible(userId: string) {
    await expect(this.getRow(userId)).toBeVisible({ timeout: 15_000 });
  }

  async hasStatus(userId: string, status: TradesmanStatus) {
    await expect(
      this.page.getByTestId(`tradesman-status-${userId}`),
    ).toHaveText(status, { timeout: 15_000 });
  }

  async openActionsMenu(userId: string) {
    const row = this.getRow(userId);
    const actionsButton = row.getByRole("button", { name: /actions/i });
    await expect(actionsButton).toBeVisible();
    await actionsButton.click();
  }

  async setStatus(
    userId: string,
    status: TradesmanStatus,
  ): Promise<void> {
    const actionLabel =
      status === "active"
        ? "Make active"
        : status === "inactive"
          ? "Make inactive"
          : "Set to draft";

    await this.openActionsMenu(userId);

    const [response] = await Promise.all([
      this.page.waitForResponse(
        (res) =>
          res.url().includes("/api/admin/tradesmen/") &&
          res.url().endsWith("/status"),
        { timeout: 20_000 },
      ),
      this.page.getByRole("menuitem", { name: actionLabel }).click(),
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
