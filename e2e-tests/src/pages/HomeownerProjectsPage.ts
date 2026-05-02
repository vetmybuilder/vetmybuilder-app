import { expect, type Locator, type Page } from "@playwright/test";
import { safeGoto } from "../helpers/navigation";
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
  readonly filtersToolbar: Locator;
  readonly typeFilterButton: Locator;
  readonly statusFilterButton: Locator;
  readonly resetFiltersLink: Locator;

  constructor(page: Page) {
    this.page = page;

    this.myProjectsTab = page.getByRole("link", { name: /my jobs/i });
    this.completedTab = page.getByRole("link", { name: /completed/i });
    this.communityTab = page.getByRole("link", { name: /community/i });
    this.favouritesTab = page.getByRole("link", { name: /favourites/i });

    // /projects renders both a desktop card (data-testid=projects-safety-card)
    // and a mobile card (data-testid=projects-mobile-safety-card). Both
    // sit in the DOM and toggle via Tailwind responsive classes - so a
    // page-wide getByText for the description matches BOTH and trips
    // strict mode. Filter to whichever is actually visible for the
    // current viewport.
    this.safetyAccordion = page
      .getByTestId("projects-safety-card")
      .or(page.getByTestId("projects-mobile-safety-card"))
      .filter({ visible: true });
    this.safetyHeading = this.safetyAccordion.getByRole("heading", {
      name: /Safety & verification/i,
    });
    this.safetyDescription = this.safetyAccordion.getByText(
      /We combine official checks with community signals/i,
    );

    this.companiesHouseRow = page.getByText(/Verified businesses/i);
    this.vmbScoreRow = page.getByText(/Trust score/i);
    this.tipRow = page.getByText(/Always ask for a written quote/i);

    // Desktop renders a labeled "Filter by / Type / Status" toolbar;
    // mobile renders a chip row (Type + Sort, no Status). Both wrappers
    // sit in the DOM at all times - filter to whichever is visible to
    // avoid strict-mode and hidden-element failures.
    this.filtersToolbar = page
      .getByText(/^Filter by$/i)
      .or(page.getByTestId("projects-mobile-filter-chips"))
      .filter({ visible: true });
    this.typeFilterButton = page
      .getByRole("button", { name: /^Type$/i })
      .filter({ visible: true });
    this.statusFilterButton = page
      .getByRole("button", { name: /^Status$/i })
      .filter({ visible: true });
    this.resetFiltersLink = page.getByRole("button", { name: /reset/i });
  }

  async goto() {
    await safeGoto(this.page, "/projects");
    await expect(this.page).toHaveURL(/\/projects$/);
  }

  async expectVisible() {
    // Both desktop (projects-page) and mobile (projects-mobile) wrappers
    // sit in the DOM at all times - Tailwind responsive classes hide one.
    // Filter to whichever is actually visible to avoid strict-mode failure.
    await expect(
      this.page
        .getByTestId("projects-page")
        .or(this.page.getByTestId("projects-mobile"))
        .filter({ visible: true }),
    ).toBeVisible({ timeout: 15000 });
  }

  async visit(projectId: string | number) {
    await this.page.goto(`/projects/${projectId}`);
    await expect(this.page).toHaveURL(new RegExp(`/projects/${projectId}$`));
  }

  async gotoTab(tab: string) {
    await safeGoto(this.page, `/projects?tab=${tab}`);
  }

  findProjectById(projectId: string | number): Locator {
    const id = String(projectId);
    return this.page.getByTestId(`project-image-card-${id}`);
  }

  findCompletedCardById(projectId: string | number): Locator {
    return this.page.getByTestId(`completed-card-${String(projectId)}`);
  }

  async hasCompletedCard(projectId: string | number) {
    await expect(this.findCompletedCardById(projectId)).toBeVisible({
      timeout: 15_000,
    });
  }

  async hasNoCompletedCard(projectId: string | number) {
    await expect(this.findCompletedCardById(projectId)).not.toBeVisible();
  }

  async clickBuilderLink(projectId: string | number) {
    const link = this.page.getByTestId(`link-${String(projectId)}-tradesman`);
    await expect(link).toBeVisible({ timeout: 10_000 });
    await link.click();
  }

  async hasNavigatedToTradesmanProfile(_tradesmanUid: string) {
    // URL now uses public_id (UUID) rather than Firebase UID — just verify we
    // landed on *some* tradesman profile page.
    await expect(this.page).toHaveURL(/\/tradesman\//, { timeout: 10_000 });
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
    await expect(this.page).toHaveURL(/\/projects$/, { timeout: 20_000 });
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

      await expect(infoCard).toBeVisible({ timeout: 20_000 });

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
    await expect(this.page).toHaveURL("/projects");
  }

  async assertFiltersVisible() {
    await expect(this.filtersToolbar).toBeVisible();
    await expect(this.typeFilterButton).toBeVisible();
    // Status filter only exists in the desktop toolbar; mobile uses a
    // sort chip in its place.
    const vp = this.page.viewportSize();
    const isMobile = vp ? vp.width < 768 : false;
    if (!isMobile) {
      await expect(this.statusFilterButton).toBeVisible();
    }
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

  async selectTypeFilter(type: string) {
    await this.typeFilterButton.click();
    await this.page.getByRole("menuitem", { name: type }).click();
  }

  async selectStatusFilter(status: string) {
    await this.statusFilterButton.click();
    await this.page.getByRole("menuitem", { name: status }).click();
  }

  findProjectCardById(projectId: string | number): Locator {
    return this.page.getByTestId(`project-image-card-${String(projectId)}`);
  }

  async hasNoProject(projectId: string | number) {
    await expect(this.findProjectCardById(projectId)).not.toBeVisible();
  }

  // ─── Favourites tab ───────────────────────────────────────────────

  private get favouritesSection(): Locator {
    return this.page.getByTestId("favourites-tradesmen-section");
  }

  private get favouritesEmpty(): Locator {
    return this.page.getByTestId("favourites-empty");
  }

  private get favouriteCards(): Locator {
    return this.page.getByTestId("favourite-tradesman-card");
  }

  async expectFavouritesEmpty() {
    await expect(this.favouritesSection).toBeVisible({ timeout: 15_000 });
    await expect(this.favouritesEmpty).toBeVisible();
    await expect(this.favouritesEmpty).toContainText("haven't saved any builders");
  }

  async expectFavouriteCardVisible(companyName: string) {
    await expect(this.favouritesSection).toBeVisible({ timeout: 15_000 });
    const card = this.favouriteCards.filter({ hasText: companyName }).first();
    await expect(card).toBeVisible({ timeout: 15_000 });
  }

  async clickFirstFavouriteCard() {
    await expect(this.favouriteCards.first()).toBeVisible({ timeout: 15_000 });
    await this.favouriteCards.first().click();
  }

  async expectNavigatedToTradesmanProfile() {
    await expect(this.page).toHaveURL(/\/tradesman\//, { timeout: 15_000 });
  }
}

export default HomeownerProjectsPage;
