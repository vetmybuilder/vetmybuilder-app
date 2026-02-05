import { Page, Locator, expect } from "@playwright/test";
import Project from "../models/Project";

export class ProjectDetailsPage {
  readonly page: Page;
  readonly root: Locator;

  readonly title: Locator;
  readonly statusPill: Locator;
  readonly shareAndPublish: Locator;
  readonly topRecommendations: Locator;

  constructor(page: Page) {
    this.page = page;

    this.root = page.getByTestId("main-content");

    this.title = this.root.getByRole("heading").first();
    this.statusPill = this.root.getByRole("status", {
      name: /pending/i,
    });
    this.shareAndPublish = this.root.getByTestId("btn-get-recs-draft");
    this.topRecommendations = this.root.getByText("Top recommendations", {
      exact: true,
    });
  }

  async assertLoaded() {
    await expect(this.page).toHaveURL(/\/projects\/[^/]+$/);
    await expect(this.title).toBeVisible();
  }

  async assertStatusPending() {
    await expect(this.statusPill).toBeVisible();
  }

  async assertShareAndPublishVisible() {
    await expect(this.shareAndPublish).toBeVisible();
  }

  async assertTopRecommendationsVisible() {
    await expect(this.topRecommendations).toBeVisible();
  }

  async hasProjectDetails(project: Project) {
    const input = project.toCreateInput();

    await expect(this.root).toContainText(input.workTypes[0]);
    await expect(this.root).toContainText(input.propertyType);
    await expect(this.root).toContainText(`${input.bedrooms} bed`);

    await expect(this.root).toContainText(input.locationPick.split(" ")[0]);

    await expect(this.root).toContainText(input.budget);
  }
}
