import { expect, type Locator, type Page } from "@playwright/test";

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

    // Top tabs (match UI: "MY PROJECTS", "COMPLETED", etc.)
    this.myProjectsTab = page.getByRole("link", { name: /my projects/i });
    this.completedTab = page.getByRole("link", { name: /completed/i });
    this.communityTab = page.getByRole("link", { name: /community/i });
    this.favouritesTab = page.getByRole("link", { name: /favourites/i });

    // Safety accordion (no labels available, so role/text first, then testId)
    this.safetyAccordion = page.getByTestId("safety-verification-accordion");
    this.safetyHeading = page.getByRole("heading", {
      name: /Safety & verification on VetMyBuilder/i,
    });
    this.safetyDescription = page.getByText(
      /We combine official checks with community signals/i,
    );

    // Accordion rows (prefer text, as there are no labels/testIds on items)
    this.companiesHouseRow = page.getByText(/Companies House checks\./i);
    this.vmbScoreRow = page.getByText(/VMB score & badges\./i);
    this.tipRow = page.getByText(/Always ask for a written quote/i);

    // Filters (no labels associated to buttons; rely on visible text/role)
    this.filterByLabel = page.getByText(/^Filter by$/i);

    this.typeFilterButton = page.getByRole("button", { name: /^Type$/i });
    this.statusFilterButton = page.getByRole("button", { name: /^Status$/i });

    this.resetFiltersLink = page.getByRole("button", { name: /reset/i });
  }

  async goto() {
    await this.page.goto("/projects");
    await expect(this.page).toHaveURL(/\/projects$/);
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
    // Only present when a filter is active; call sites can decide if needed
    await this.resetFiltersLink.click();
  }
}

export default HomeownerProjectsPage;
