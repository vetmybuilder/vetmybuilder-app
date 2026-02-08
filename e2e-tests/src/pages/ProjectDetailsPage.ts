import { Page, Locator, expect } from "@playwright/test";
import Project from "../models/Project";
import {
  PublishModalComponent,
  type PublishOptions,
} from "./components/PublishModalComponent";

export type ProjectStatus = "Pending" | "Live" | "Completed" | "Archived";

type DateChecks = {
  createdAt?: Date | string;
  updatedAt?: Date | string;
};

export class ProjectDetailsPage {
  readonly page: Page;
  readonly root: Locator;

  readonly title: Locator;
  readonly backLink: Locator;

  readonly shareAndPublish: Locator;

  // lifecycle action
  readonly closeThisJobButton: Locator;

  readonly editProjectButton: Locator;

  // estimate UI
  readonly estimateValue: Locator;
  readonly estimateInfoButton: Locator;
  readonly estimateTooltip: Locator;

  // sections
  readonly topRecommendationsSection: Locator;
  readonly spotlightSection: Locator;

  // header meta date text (e.g. "Created 07/02/2026" or "Updated 07/02/2026")
  private readonly headerMetaDate: Locator;

  private readonly publishModal: PublishModalComponent;
  private readonly publishDialog: Locator;

  constructor(page: Page) {
    this.page = page;

    this.root = page.getByTestId("main-content");
    this.title = this.root.getByRole("heading").first();

    this.backLink = page
      .getByTestId("btn-back")
      .or(page.getByRole("link", { name: "Back to project" }))
      .or(page.getByRole("link", { name: "Back" }))
      .or(page.getByRole("link", { name: /←\s*back/i }));

    // Single line under back link. We keep it flexible but scoped.
    this.headerMetaDate = this.root.locator("span.text-slate-400");

    // Header CTA (draft projects)
    this.shareAndPublish = this.root.getByTestId("btn-get-recs-draft");

    // Header action
    this.closeThisJobButton = this.root.getByTestId("btn-close-project");
    this.editProjectButton = this.root.getByTestId("btn-edit");

    // Estimate value (e.g. £1,000–£2,000)
    this.estimateValue = this.root.getByText(/^£[\d,]+–£[\d,]+$/);

    // These should exist in UI (recommended QA attributes)
    this.estimateInfoButton = this.root.getByTestId("job-estimate-info");
    this.estimateTooltip = this.root.getByTestId("job-estimate-tooltip");

    // Sections
    this.topRecommendationsSection = page.getByTestId("project-shortlist");
    this.spotlightSection = page.getByTestId("spotlight-strip");

    // Publish modal
    this.publishModal = new PublishModalComponent(page);
    this.publishDialog = page.getByTestId("get-recs-modal");
  }

  private toDate(v: Date | string) {
    return v instanceof Date ? v : new Date(v);
  }

  // UI uses en-GB in OwnerProjectView: toLocaleDateString("en-GB")
  private formatUiDate(d: Date) {
    return d.toLocaleDateString("en-GB");
  }

  /**
   * Strict check:
   * - createdAt => expects exactly "Created dd/mm/yyyy"
   * - updatedAt => expects exactly "Updated dd/mm/yyyy"
   *
   * If both are provided, updatedAt wins (because caller explicitly wants Updated).
   */
  async assertCreatedOrUpdatedDate(dates: DateChecks) {
    if (!dates.createdAt && !dates.updatedAt) return;

    await expect(this.headerMetaDate).toBeVisible();

    if (dates.updatedAt) {
      const d = this.toDate(dates.updatedAt);
      const expected = `Updated ${this.formatUiDate(d)}`;
      await expect(this.headerMetaDate).toHaveText(expected);
      return;
    }

    if (dates.createdAt) {
      const d = this.toDate(dates.createdAt);
      const expected = `Created ${this.formatUiDate(d)}`;
      await expect(this.headerMetaDate).toHaveText(expected);
    }
  }

  /**
   * Convenience for your edit flow:
   * asserts exactly "Updated <today>" using the browser's locale formatting (en-GB).
   */
  async assertUpdatedToday() {
    await expect(this.headerMetaDate).toBeVisible();

    const today = await this.page.evaluate(() =>
      new Date().toLocaleDateString("en-GB"),
    );

    await expect(this.headerMetaDate).toHaveText(`Updated ${today}`);
  }

  async visit(projectId: string | number) {
    await this.page.goto(`/projects/${projectId}`);
    await expect(this.page).toHaveURL(new RegExp(`/projects/${projectId}$`));
    await expect(this.title).toBeVisible();
  }

  async editProject(projectId?: string | number) {
    await expect(this.editProjectButton).toBeVisible();
    await this.editProjectButton.click();
    if (projectId !== undefined) {
      await expect(this.page).toHaveURL(
        new RegExp(`/projects/${projectId}/edit$`),
      );
    } else {
      await expect(this.page).toHaveURL(/\/projects\/[^/]+\/edit$/);
    }
  }

  async goBack() {
    await expect(this.backLink).toBeVisible();
    await this.backLink.click();
    await expect(this.page).toHaveURL(/\/projects$/);
  }

  async hasStatus(status: ProjectStatus) {
    const map: Record<ProjectStatus, RegExp> = {
      Pending: /pending/i,
      Live: /live|published/i,
      Completed: /completed/i,
      Archived: /archived/i,
    };

    await expect(this.root.getByRole("status")).toHaveText(map[status]);
  }

  async hasProjectDetails(
    project: Project,
    opts?: { status?: ProjectStatus; dates?: DateChecks },
  ) {
    const input = project.toCreateInput();

    await expect(this.page).toHaveURL(/\/projects\/[^/]+$/);
    await expect(this.title).toBeVisible();

    // Header bits
    await expect(this.backLink).toBeVisible();
    await expect(this.closeThisJobButton).toBeVisible();

    // Created/Updated date check (optional)
    if (opts?.dates) {
      await this.assertCreatedOrUpdatedDate(opts.dates);
    }

    // Status (optional)
    if (opts?.status) {
      await this.hasStatus(opts.status);
    }

    // Project attributes
    await expect(this.root).toContainText(input.workTypes[0]);
    await expect(this.root).toContainText(input.propertyType);
    await expect(this.root).toContainText(`${input.bedrooms} bed`);
    await expect(this.root).toContainText(input.locationPick.split(" ")[0]);
    await expect(this.root).toContainText(input.budget);

    // Estimate + tooltip (QA attributes make this stable)
    await expect(this.estimateValue).toBeVisible();
    await expect(this.estimateInfoButton).toBeVisible();
    await this.estimateInfoButton.hover();

    await expect(this.estimateTooltip).toBeVisible();
    await expect(this.estimateTooltip).toContainText(
      "Job estimate based on your project details.",
    );
    await expect(this.estimateTooltip).toContainText(
      "This is a guide price and actual quotes may vary depending on site visit, materials and final scope.",
    );
  }

  async hasTopRecommendations(expected: boolean) {
    await expect(this.topRecommendationsSection).toBeVisible();

    if (!expected) {
      await expect(this.topRecommendationsSection).toContainText(
        "No builders have yet been recommended by a friend or neighbours.",
      );
      await expect(this.topRecommendationsSection).toContainText(
        "Share this project with friends or neighbours to start seeing recommendations from vetted tradespeople.",
      );

      await expect(
        this.topRecommendationsSection.getByTestId(
          "btn-shortlist-share-publish",
        ),
      ).toBeVisible();

      return;
    }

    await expect(this.topRecommendationsSection).not.toContainText(
      "No builders have yet been recommended by a friend or neighbours.",
    );
  }

  async hasSpotlight(expected: boolean) {
    await expect(this.spotlightSection).toBeVisible();

    if (!expected) {
      await expect(this.spotlightSection).toContainText(
        "No spotlight tradesmen are available for this project yet.",
      );
      return;
    }

    await expect(this.spotlightSection).not.toContainText(
      "No spotlight tradesmen are available for this project yet.",
    );
  }

  async publish(options?: PublishOptions) {
    await this.shareAndPublish.click();
    await expect(this.publishDialog).toBeVisible();
    await this.publishModal.publish(options);
    await expect(this.publishDialog).toBeHidden();
  }
}

export default ProjectDetailsPage;
