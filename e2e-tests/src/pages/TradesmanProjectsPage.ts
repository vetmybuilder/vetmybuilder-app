import { expect, type Locator, type Page } from "@playwright/test";
import { safeGoto } from "../helpers/navigation";
import BasePage from "./BasePage";

export class TradesmanProjectsPage extends BasePage {
  readonly accordion: Locator;

  constructor(page: Page) {
    super(page);
    this.accordion = page.getByTestId("tradesman-projects-accordion");
  }

  async visit() {
    await safeGoto(this.page, "/tradesman/projects");
    await expect(this.page.getByTestId("tradesman-projects-page")).toBeVisible({
      timeout: 30_000,
    });
  }

  private projectRow(projectId: number | string) {
    return this.page.locator(`[data-project-id="${projectId}"]`);
  }

  async expandProject(projectId: number | string) {
    const row = this.projectRow(projectId);
    await expect(row).toBeVisible({ timeout: 30_000 });
    await row.getByTestId("project-row").click();
  }

  async expectInsightsVisible(projectId: number | string) {
    const row = this.projectRow(projectId);

    await expect
      .poll(
        async () => {
          const card = row.getByTestId("project-insights-card");
          return card.isVisible().catch(() => false);
        },
        { timeout: 30_000, intervals: [2000] },
      )
      .toBe(true);
  }

  async expectInsightsContains(projectId: number | string, text: string) {
    const card = this.projectRow(projectId).getByTestId(
      "project-insights-card",
    );
    await expect(card).toContainText(text, { timeout: 10_000 });
  }
}

export default TradesmanProjectsPage;
