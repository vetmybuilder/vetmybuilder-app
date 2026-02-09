import { Page, Locator, expect } from "@playwright/test";
import Project from "../models/Project";
import {
  PublishModalComponent,
  type PublishOptions,
} from "./components/PublishModalComponent";
import CloseProjectModalComponent, {
  type CloseProjectOptions,
} from "./components/CloseProjectModalComponent";

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

  readonly closeThisJobButton: Locator;

  readonly editProjectButton: Locator;

  readonly estimateValue: Locator;
  readonly estimateInfoButton: Locator;
  readonly estimateTooltip: Locator;

  readonly topRecommendationsSection: Locator;
  readonly spotlightSection: Locator;

  private readonly headerMetaDate: Locator;

  private readonly publishModal: PublishModalComponent;
  private readonly publishDialog: Locator;

  private readonly closeProjectModal: CloseProjectModalComponent;

  constructor(page: Page) {
    this.page = page;

    this.root = page.getByTestId("main-content");
    this.title = this.root.getByRole("heading").first();

    this.backLink = page
      .getByTestId("btn-back")
      .or(page.getByRole("link", { name: "Back to project" }))
      .or(page.getByRole("link", { name: "Back" }))
      .or(page.getByRole("link", { name: /←\s*back/i }));

    this.headerMetaDate = this.root.locator("span.text-slate-400");

    this.shareAndPublish = this.root.getByTestId("btn-get-recs-draft");

    this.closeThisJobButton = this.root.getByTestId("btn-close-project");
    this.editProjectButton = this.root.getByTestId("btn-edit");

    this.estimateValue = this.root.getByText(/^£[\d,]+–£[\d,]+$/);

    this.estimateInfoButton = this.root.getByTestId("job-estimate-info");
    this.estimateTooltip = this.root.getByTestId("job-estimate-tooltip");

    this.topRecommendationsSection = page.getByTestId("project-shortlist");
    this.spotlightSection = page.getByTestId("spotlight-strip");

    this.publishModal = new PublishModalComponent(page);
    this.publishDialog = page.getByTestId("get-recs-modal");

    this.closeProjectModal = new CloseProjectModalComponent(page);
  }

  private toDate(v: Date | string) {
    return v instanceof Date ? v : new Date(v);
  }

  private formatUiDate(d: Date) {
    return d.toLocaleDateString("en-GB");
  }

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

    await expect(this.backLink).toBeVisible();
    await expect(this.closeThisJobButton).toBeVisible();

    if (opts?.dates) {
      await this.assertCreatedOrUpdatedDate(opts.dates);
    }

    if (opts?.status) {
      await this.hasStatus(opts.status);
    }

    await expect(this.root).toContainText(input.workTypes[0]);
    await expect(this.root).toContainText(input.propertyType);
    await expect(this.root).toContainText(`${input.bedrooms} bed`);
    await expect(this.root).toContainText(input.locationPick.split(" ")[0]);
    await expect(this.root).toContainText(input.budget);

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

  async closeProject(options?: CloseProjectOptions) {
    await expect(this.closeThisJobButton).toBeVisible();
    await this.closeThisJobButton.click();
    await this.closeProjectModal.closeProject(options);
  }
}

export default ProjectDetailsPage;
