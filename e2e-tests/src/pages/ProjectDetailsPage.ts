import { Page, Locator, expect } from "@playwright/test";
import Project from "../models/Project";
import {
  PublishModalComponent,
  type PublishOptions,
} from "./components/PublishModalComponent";

export type ProjectStatus = "Pending" | "Live" | "Completed" | "Archived";

export class ProjectDetailsPage {
  readonly page: Page;
  readonly root: Locator;

  readonly title: Locator;
  readonly backLink: Locator;

  readonly shareAndPublish: Locator;

  // lifecycle action
  readonly closeThisJobButton: Locator;

  // estimate UI
  readonly estimateValue: Locator;
  readonly estimateInfoButton: Locator;
  readonly estimateTooltip: Locator;

  // sections
  readonly topRecommendationsSection: Locator;
  readonly spotlightSection: Locator;

  private readonly publishModal: PublishModalComponent;
  private readonly publishDialog: Locator;

  constructor(page: Page) {
    this.page = page;

    this.root = page.getByTestId("main-content");
    this.title = this.root.getByRole("heading").first();

    // Header "← Back"
    this.backLink = page.getByRole("link", { name: /←\s*back/i });

    // Header CTA (draft projects)
    this.shareAndPublish = this.root.getByTestId("btn-get-recs-draft");

    // Header action
    this.closeThisJobButton = this.root.getByTestId("btn-close-project");

    // Estimate value (e.g. £1,000–£2,000)
    this.estimateValue = this.root.getByText(/^£[\d,]+–£[\d,]+$/);

    // These should exist in UI (recommended QA attributes)
    this.estimateInfoButton = this.root.getByTestId("job-estimate-info");
    this.estimateTooltip = this.root.getByTestId("job-estimate-tooltip");

    // Sections (these already exist per your notes)
    this.topRecommendationsSection = page.getByTestId("project-shortlist");
    this.spotlightSection = page.getByTestId("spotlight-strip");

    // Publish modal
    this.publishModal = new PublishModalComponent(page);
    this.publishDialog = page.getByTestId("get-recs-modal");
  }

  async visit(projectId: string | number) {
    await this.page.goto(`/projects/${projectId}`);
    await expect(this.page).toHaveURL(new RegExp(`/projects/${projectId}$`));
    await expect(this.title).toBeVisible();
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

  async hasProjectDetails(project: Project, opts?: { status?: ProjectStatus }) {
    const input = project.toCreateInput();

    await expect(this.page).toHaveURL(/\/projects\/[^/]+$/);
    await expect(this.title).toBeVisible();

    // Header bits
    await expect(this.backLink).toBeVisible();
    await expect(this.closeThisJobButton).toBeVisible();

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

      // ✅ scope the share button to the shortlist block (fixes strict-mode clash)
      await expect(
        this.topRecommendationsSection.getByTestId(
          "btn-shortlist-share-publish",
        ),
      ).toBeVisible();

      return;
    }

    // For now: just assert the empty-state text is NOT shown.
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
