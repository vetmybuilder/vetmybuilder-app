import { expect, type Locator, type Page } from "@playwright/test";
import Project from "../models/Project";

export class HomeownerProjectsPage {
  readonly page: Page;

  // Page / navigation
  readonly myProjectsTab: Locator;
  readonly completedTab: Locator;
  readonly communityTab: Locator;
  readonly favouritesTab: Locator;

  // Safety & verification accordion
  readonly safetyAccordion: Locator;
  readonly safetyHeading: Locator;
  readonly safetyDescription: Locator;

  readonly companiesHouseRow: Locator;
  readonly vmbScoreRow: Locator;
  readonly tipRow: Locator;

  // Filters
  readonly filterByLabel: Locator;
  readonly typeFilterButton: Locator;
  readonly statusFilterButton: Locator;
  readonly resetFiltersLink: Locator;

  constructor(page: Page) {
    this.page = page;

    this.myProjectsTab = page.getByRole("link", { name: /my projects/i });
    this.completedTab = page.getByRole("link", { name: /completed/i });
    this.communityTab = page.getByRole("link", { name: /community/i });
    this.favouritesTab = page.getByRole("link", { name: /favourites/i });

    this.safetyAccordion = page.getByTestId("safety-verification-accordion");
    this.safetyHeading = page.getByRole("heading", {
      name: /Safety & verification on VetMyBuilder/i,
    });
    this.safetyDescription = page.getByText(
      /We combine official checks with community signals/i,
    );

    this.companiesHouseRow = page.getByText(/Companies House checks\./i);
    this.vmbScoreRow = page.getByText(/VMB score & badges\./i);
    this.tipRow = page.getByText(/Always ask for a written quote/i);

    this.filterByLabel = page.getByText(/^Filter by$/i);
    this.typeFilterButton = page.getByRole("button", { name: /^Type$/i });
    this.statusFilterButton = page.getByRole("button", { name: /^Status$/i });
    this.resetFiltersLink = page.getByRole("button", { name: /reset/i });
  }

  async goto() {
    await this.page.goto("/projects");
    await expect(this.page).toHaveURL(/\/projects$/);
  }

  async visit(projectId: string | number) {
    await this.page.goto(`/projects/${projectId}`);
    await expect(this.page).toHaveURL(new RegExp(`/projects/${projectId}$`));
  }

  findProjectById(projectId: string | number): Locator {
    const id = String(projectId);
    return this.page.getByTestId(`project-image-card-${id}`);
  }

  async hasStatus(projectId: string | number, expected: string | RegExp) {
    const card = this.findProjectById(projectId);
    await expect(card).toBeVisible();
    await expect(card).toContainText(expected);
  }

  async hasProject(projects: Project[]) {
    await expect(this.page).toHaveURL(/\/projects$/);
    await expect(projects.length).toBeGreaterThan(0);

    for (const p of projects) {
      const input = p.toCreateInput();

      // Find the info card by its text content
      const infoCard = this.page
        .locator('article[data-testid^="project-info-card-"]')
        .filter({ hasText: input.workTypes[0] })
        .filter({ hasText: input.locationPick.split(" ")[0] })
        .filter({ hasText: input.propertyType })
        .filter({ hasText: `Beds ${input.bedrooms}` })
        .first();

      await expect(infoCard).toBeVisible();

      const testId = await infoCard.getAttribute("data-testid");
      if (!testId) throw new Error("Project info card missing data-testid");

      const m = testId.match(/project-info-card-(\d+)/);
      if (!m?.[1]) {
        throw new Error(`Unexpected project info card test id: ${testId}`);
      }

      const id = m[1];

      const imageCard = this.page.getByTestId(`project-image-card-${id}`);
      await expect(imageCard).toBeVisible();

      await expect(imageCard).toContainText(
        /pending|live|published|completed|archived/i,
      );

      await expect(infoCard).toContainText(input.workTypes[0]);
      await expect(infoCard).toContainText(input.locationPick.split(" ")[0]);
      await expect(infoCard).toContainText(input.propertyType);
      await expect(infoCard).toContainText(`Beds ${input.bedrooms}`);
    }
  }

  async assertSafetyVerificationCardVisible() {
    await expect(this.safetyAccordion).toBeVisible();
    await expect(this.safetyHeading).toBeVisible();
    await expect(this.safetyDescription).toBeVisible();

    await expect(this.companiesHouseRow).toBeVisible();
    await expect(this.vmbScoreRow).toBeVisible();
    await expect(this.tipRow).toBeVisible();
  }

  async assertFiltersVisible() {
    await expect(this.filterByLabel).toBeVisible();
    await expect(this.typeFilterButton).toBeVisible();
    await expect(this.statusFilterButton).toBeVisible();
  }

  async openTypeFilter() {
    await this.typeFilterButton.click();
    await expect(this.page.getByRole("menu")).toBeVisible();
  }

  async openStatusFilter() {
    await this.statusFilterButton.click();
    await expect(this.page.getByRole("menu")).toBeVisible();
  }

  async resetFilters() {
    await this.resetFiltersLink.click();
  }
}

export default HomeownerProjectsPage;
