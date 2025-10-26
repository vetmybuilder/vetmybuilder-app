// e2e-tests/src/pages/ProjectsPage.ts
import { Page, Locator } from "@playwright/test";
import { BasePage } from "./BasePage";
import Project from "../models/Project";
import { expect } from "../fixtures/expect-extend";
import { statusLabel } from "../../src/utils/formatters";

export class ProjectsPage extends BasePage {
  readonly heading: Locator;
  readonly menuItem: Locator;

  readonly notification: Locator;
  // top actions / tabs
  readonly tabMyProjects: Locator;
  readonly tabArchived: Locator;
  readonly tabFavourites: Locator;
  readonly tabCommunityProjects: Locator;
  readonly tabCompletedCommunityProjects: Locator;
  readonly tabMyRecommendations: Locator;
  readonly createNewProjectBtn: Locator;

  // filters
  readonly nameFilter: Locator;
  readonly typeFilter: Locator;
  readonly locationFilter: Locator;
  readonly propertyFilter: Locator;
  readonly statusFilter: Locator;

  // table / grid
  readonly table: Locator;
  readonly emptyState: Locator;
  readonly prevBtn: Locator;
  readonly nextBtn: Locator;
  readonly projectEmpty: Locator;

  constructor(page: Page) {
    super(page);

    this.notification = page.getByRole("button", { name: /notifications/i });
    this.menuItem = page.getByRole("menuitem");

    // heading
    this.heading = page.getByTestId("projects-title");

    // tabs & CTA
    this.tabMyProjects = page.getByTestId("tab-my-projects");
    this.tabMyRecommendations = page.getByTestId("tab-my-recommendations");
    this.tabArchived = page.getByTestId("tab-archived");
    this.tabFavourites = page.getByTestId("tab-favourites");
    this.tabCommunityProjects = page.getByTestId("tab-community-projects");
    this.tabCompletedCommunityProjects = page.getByTestId(
      "tab-completed-community-projects"
    );
    this.createNewProjectBtn = page.getByTestId("btn-create-project");

    // filters (use testids)
    this.nameFilter = page.getByTestId("filter-name");
    this.typeFilter = page.getByTestId("filter-type");
    this.locationFilter = page.getByTestId("filter-location");
    this.propertyFilter = page.getByTestId("filter-property");
    this.statusFilter = page.getByTestId("filter-status");

    // table area
    this.table = page.getByTestId("projects-table");
    this.emptyState = page.getByTestId("projects-empty");
    this.prevBtn = page.getByTestId("pager-prev");
    this.nextBtn = page.getByTestId("pager-next");
    this.projectEmpty = page.getByTestId("projects-empty");
  }

  async goto() {
    await this.page.goto("/projects");
  }

  /** Open the projects list and wait for the shell to load. */
  async gotoList() {
    await this.page.goto("/projects");
    await this.page.waitForLoadState("networkidle");
    await this.expectLoaded();
  }

  async viewForProjectId(id: number) {
    await this.expectLoaded();
    await this.ensureServerSession();
    await this.page.goto(`/projects/${id}`);
    await this.page.waitForLoadState("networkidle");
  }

  async expectLoaded() {
    await expect(this.page.getByTestId("projects-page")).toBeVisible();
    await expect(this.heading).toBeVisible();
    await expect(this.nameFilter).toBeVisible();
  }

  async expectEmpty() {
    await this.expectLoaded();
    await expect(this.emptyState).toBeVisible();
  }

  async openCreateNewProject() {
    await this.createNewProjectBtn.click();
    await expect(this.page).toHaveURL(/\/projects\/new$/);
  }

  async filterByName(name: string) {
    await this.nameFilter.fill(name);
  }

  async clearFilters() {
    await this.nameFilter.clear();
    await this.typeFilter.clear();
    await this.locationFilter.clear();
    await this.propertyFilter.clear();
    await this.statusFilter.selectOption("all").catch(() => {});
  }

  // PageObject
  async hasProjects(
    projects: Array<Project>,
    headers?: string[],
    actionsText?: string
  ): Promise<void> {
    const defaultHeaders = [
      "Name",
      "Type",
      "Location",
      "Property",
      "Beds",
      "Created",
      "Status",
    ];

    const hdrs = headers?.length ? headers : defaultHeaders;
    const includeActions = hdrs.includes("Actions");
    const rows = projects.map((proj) => {
      const p =
        typeof (proj as any).toJSON === "function"
          ? (proj as any).toJSON()
          : proj;

      const row: any[] = [
        p.name,
        p.type,
        p.location,
        p.propertyType,
        String(p.bedrooms),
        expect.any(String),
        statusLabel((proj as any).status),
      ];

      if (includeActions) {
        row.push(actionsText ?? expect.any(String));
      }

      return row;
    });

    await expect(this.table).toHaveTableData([hdrs, ...rows]);
  }

  TableRow(name: string): Locator {
    return this.table.getByRole("row").filter({
      has: this.page.getByRole("link", {
        name: `Open project ${name}`,
        exact: true,
      }),
    });
  }

  async viewProject(name: string): Promise<void> {
    await this.table
      .getByRole("link", { name: `Open project ${name}`, exact: true })
      .click();

    await expect(this.page).toHaveURL(/\/projects\/\d+$/);
  }

  async hasNoRecommendations(): Promise<void> {
    await this.page.getByRole("tab", { name: "My Recommendations" }).click();
    await expect(this.projectEmpty).toBeVisible();
  }

  async hasNoProjects(): Promise<void> {
    await this.page.getByRole("tab", { name: "My Projects" }).click();
    await expect(this.projectEmpty).toBeVisible();
  }

  async addToFavourites(projectOrId: number | { id: number }): Promise<void> {
    const id = typeof projectOrId === "number" ? projectOrId : projectOrId.id;
    await this.page
      .getByTestId(`row-${id}`)
      .getByTestId(`btn-${id}-add-favourite`)
      .click();
  }

  async removeFromFavourites(
    projectOrId: number | { id: number }
  ): Promise<void> {
    const id = typeof projectOrId === "number" ? projectOrId : projectOrId.id;
    await this.page
      .getByTestId(`row-${id}`)
      .getByTestId(`btn-${id}-remove-favourite`)
      .click();
  }

  /* -------------------- NEW HELPERS (no reload) -------------------- */

  /** Locator for a project link/row by its display name. */
  rowByName(name: string): Locator {
    // Adjust if your link text differs
    return this.page.getByRole("link", { name, exact: false });
  }

  /**
   * Client-side refresh: toggle tabs to trigger the SPA to refetch,
   * avoiding full page reload (which logs you out).
   */
  private async softRefreshViaTabs() {
    // Toggle to "My Recommendations" and back to "My Projects"
    await this.tabMyRecommendations.click();
    await this.page.waitForLoadState("networkidle");
    await this.tabMyProjects.click();
    await this.page.waitForLoadState("networkidle");
  }

  /** Open a project by name after ensuring it is visible in the list. */
  async openProjectByName(name: string) {
    await this.rowByName(name).click();
    await this.page.waitForLoadState("networkidle");
    await expect(this.page).toHaveURL(/\/projects\/\d+$/);
  }

  async filterByNameAndWait(name: string) {
    await this.nameFilter.fill(name);
    await this.page.waitForLoadState("networkidle");

    expect
      .poll(
        async () => {
          const rowCount = await this.table
            .getByRole("row")
            .count()
            .catch(() => 0);
          return rowCount >= 1;
        },
        {
          message: `Expected at least one project row to be visible after filtering by name "${name}"`,
        }
      )
      .toBe(true);
  }
}

export default ProjectsPage;
