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
    try {
      await this.page.goto("/projects", { waitUntil: "domcontentloaded" });
    } catch (error) {
      const message = String(error);
      if (!message.includes("interrupted by another navigation")) {
        throw error;
      }
      await this.page.waitForURL(/\/projects$/, {
        waitUntil: "domcontentloaded",
      });
    }

    await expect(this.page).toHaveURL(/\/projects$/);
  }

  async waitUntilReady() {
    await expect(this.page).toHaveURL("/projects");

    await expect(this.page.getByTestId("projects-page")).toBeVisible({
      timeout: 15000,
    });
  }

  async visit(projectId: string | number) {
    await this.page.goto(`/projects/${projectId}`);
    await expect(this.page).toHaveURL(new RegExp(`/projects/${projectId}$`));
  }

  findProjectById(projectId: string | number): Locator {
    const id = String(projectId);
    return this.page.getByTestId(`project-image-card-${id}`);
  }

  private normalizeExpected(expected: string | RegExp): RegExp {
    return expected instanceof RegExp ? expected : new RegExp(expected, "i");
  }

  async hasStatus(projectId: string | number, expected: string | RegExp) {
    const card = this.findProjectById(projectId);
    const expectedRe = this.normalizeExpected(expected);

    // The projects list/card rendering can lag slightly behind API writes.
    // Poll until:
    //  - the card exists
    //  - it's visible
    //  - it contains the expected status text
    await expect
      .poll(
        async () => {
          const count = await card.count();
          if (count === 0) return { ok: false, why: "card not in DOM yet" };

          const visible = await card
            .first()
            .isVisible()
            .catch(() => false);
          if (!visible) return { ok: false, why: "card not visible yet" };

          const text = (
            await card
              .first()
              .innerText()
              .catch(() => "")
          ).trim();
          const matches = expectedRe.test(text);

          return { ok: matches, why: matches ? "ok" : `text="${text}"` };
        },
        {
          timeout: 20_000,
          intervals: [200, 300, 500, 800, 1200],
          message: `Expected project card ${projectId} to appear on /projects and contain status matching: ${String(
            expected,
          )}`,
        },
      )
      .toEqual({ ok: true, why: "ok" });
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
    await expect(this.page).toHaveURL("/projects");
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
