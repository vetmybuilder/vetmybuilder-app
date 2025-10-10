// e2e-tests/src/pages/CreateProjectPage.ts
import { Page, Locator, expect } from "@playwright/test";
import { BasePage } from "./BasePage";
import Project from "../models/Project";

export class CreateProjectPage extends BasePage {
  readonly heading: Locator;

  readonly wizard: Locator;
  readonly activeStep: Locator;

  readonly name: Locator;
  readonly type: Locator;
  readonly location: Locator;
  readonly propertyType: Locator;
  readonly bedrooms: Locator;
  readonly description: Locator;

  readonly nextBtn: Locator;
  readonly createBtn: Locator;
  readonly backBtn: Locator;

  readonly reviewName: Locator;
  readonly reviewType: Locator;
  readonly reviewLocation: Locator;
  readonly reviewProperty: Locator;
  readonly reviewBedrooms: Locator;
  readonly reviewDescription: Locator;

  constructor(page: Page) {
    super(page);

    this.heading = page.getByTestId("create-project-title");

    this.wizard = page.getByTestId("wizard");
    this.activeStep = this.wizard.locator('section:not([aria-hidden="true"])');

    this.name = page.locator("#np-name");
    this.type = page.locator("#np-type");
    this.location = page.locator("#np-location");
    this.propertyType = page.locator("#np-property");
    this.bedrooms = page.locator("#np-beds");
    this.description = page.locator("#np-desc");

    this.nextBtn = this.activeStep.getByTestId("wizard-next");
    this.createBtn = this.activeStep.getByTestId("wizard-create");
    this.backBtn = this.activeStep.getByTestId("wizard-back");

    this.reviewName = page.getByTestId("review-name");
    this.reviewType = page.getByTestId("review-type");
    this.reviewLocation = page.getByTestId("review-location");
    this.reviewProperty = page.getByTestId("review-property");
    this.reviewBedrooms = page.getByTestId("review-bedrooms");
    this.reviewDescription = page.getByTestId("review-description");
  }

  async goto() {
    await this.page.goto("/projects/new");
    await expect(this.heading).toBeVisible();
    await this.waitForStep("name");
  }

  private async waitForStep(key: string) {
    await expect(this.wizard).toHaveAttribute("data-current-step", key);
  }

  private async nextTo(stepKey: string) {
    await this.nextBtn.click();
    await this.waitForStep(stepKey);
  }

  async expectReview(project: Project) {
    const p = project.toJSON();
    await this.waitForStep("review");
    await expect(this.reviewName).toHaveText(p.name);
    await expect(this.reviewType).toHaveText(p.type);
    await expect(this.reviewLocation).toHaveText(p.location);
    await expect(this.reviewProperty).toHaveText(p.propertyType);
    await expect(this.reviewBedrooms).toHaveText(String(p.bedrooms));
    await expect(this.reviewDescription).toHaveText(p.description);
  }

  async createProject(project: Project) {
    await this.waitForStep("name");
    await expect(this.name).toBeVisible();
    await this.name.fill(project.name);
    await this.nextTo("type");

    await this.waitForStep("type");
    await expect(this.type).toBeVisible();
    await this.type.fill(project.type);
    await this.nextTo("location");

    await this.waitForStep("location");
    await expect(this.location).toBeVisible();
    await this.location.fill(project.location);
    await this.nextTo("propertyType");

    await this.waitForStep("propertyType");
    await expect(this.propertyType).toBeVisible();
    await this.propertyType.selectOption(project.propertyType);
    await this.nextTo("bedrooms");

    await this.waitForStep("bedrooms");
    await expect(this.bedrooms).toBeVisible();
    await this.bedrooms.fill(project.bedrooms.toString());
    await this.nextTo("description");

    await this.waitForStep("description");
    await expect(this.description).toBeVisible();
    await this.description.fill(project.description);
    await this.nextTo("review");

    await this.expectReview(project);

    await this.createBtn.click();
    await expect(this.page).toHaveURL(/\/projects\/\d+$/);
  }
}
