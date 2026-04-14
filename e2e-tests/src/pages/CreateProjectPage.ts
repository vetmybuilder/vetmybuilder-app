import { Page, Locator, expect } from "@playwright/test";
import type {
  ProjectCreateInput as CreateProjectInput,
  FlooringAnswers,
} from "../models/Project";
import { escapeRegExp, ensureEndsWithPeriod } from "../utils/formatters";

export class CreateProjectPage {
  readonly page: Page;

  private readonly mobileMenuButton: Locator;
  private readonly desktopPostJob: Locator;
  private readonly mobilePostJob: Locator;

  private readonly categorySelect: Locator;
  private readonly locationWrap: Locator;
  private readonly locationInput: Locator;

  private readonly nextBtn: Locator;
  private readonly createBtn: Locator;

  private readonly propertyTypeBtn: Locator;
  private readonly bedroomsBtn: Locator;

  private readonly timeframeBtn: Locator;
  private readonly budgetBtn: Locator;
  private readonly materialsBtn: Locator;

  private readonly accessWrap: Locator;
  private readonly notesInput: Locator;
  private readonly preview: Locator;

  constructor(page: Page) {
    this.page = page;

    this.mobileMenuButton = page.getByTestId("btn-mobile-menu");
    this.desktopPostJob = page.getByTestId("btn-post-job-header");
    this.mobilePostJob = page.getByTestId("mobile-menu-post-job");

    this.categorySelect = page.getByTestId("field-category");

    this.locationWrap = page.getByTestId("field-location");
    this.locationInput = this.locationWrap.locator("input").first();

    this.nextBtn = page.getByRole("button", { name: /next/i }).first();
    this.createBtn = page
      .getByRole("button", { name: /create project/i })
      .first();

    this.propertyTypeBtn = page.locator("#np-property-button");
    this.bedroomsBtn = page.locator("#np-beds-button");

    this.timeframeBtn = page.locator("#db-timeframe-button");
    this.budgetBtn = page.locator("#db-budget-button");
    this.materialsBtn = page.locator("#db-materials-button");

    this.accessWrap = page.getByTestId("db-access");
    this.notesInput = page.getByTestId("db-notes");
    this.preview = page.getByTestId("db-preview");
  }

  private postJobButton(isMobile: boolean) {
    return isMobile ? this.mobilePostJob : this.desktopPostJob;
  }

  private stepRegion(title: string) {
    return this.page
      .getByRole("region", { name: new RegExp(title, "i") })
      .first();
  }

  async createProject(
    input: CreateProjectInput,
    isMobile: boolean,
  ): Promise<string> {
    await this.page.goto("/projects", { waitUntil: "domcontentloaded" });

    if (isMobile) {
      await this.mobileMenuButton.waitFor({ state: "visible" });
      await this.mobileMenuButton.click();
    }

    await this.postJobButton(isMobile).click();
    await this.page.waitForURL("**/projects/new", { timeout: 30_000 });

    await this.selectCategory(input.category);
    await this.selectWorkTypes(input.workTypes);
    await this.next();

    await this.waitForStep("Location");
    await this.setLocation(input.locationQuery, input.locationPick);
    await this.next();

    await this.waitForStep("Property type");
    await this.selectPropertyType(input.propertyType);
    await this.next();

    await this.waitForStep("Bedrooms");
    await this.selectBedrooms(input.bedrooms);
    await this.next();

    // Dynamic "About the floor" step only appears for flooring-like work types.
    // Callers signal this by attaching flooringAnswers to the input.
    if (input.flooringAnswers) {
      await this.waitForStep("About the floor");
      await this.fillFlooringDetails(input.flooringAnswers);
      await this.next();
    }

    await this.waitForStep("Brief description");
    await this.fillDescriptionStep(input);
    await this.next();

    await this.waitForStep("Review & create");
    await this.assertReviewStep(input);

    await this.createBtn.click();
 
    await this.page.waitForURL(
      (url) => /^\/projects\/\d+\/?$/.test(url.pathname),
      { timeout: 30_000 },
    );

    const { pathname } = new URL(this.page.url());
    const projectId = pathname.split("/").filter(Boolean).pop() as string;

    return projectId;
  }

  private async selectCategory(category: string) {
    await expect(this.categorySelect).toBeVisible();
    await this.categorySelect.selectOption({ label: category });
    await this.waitForStep("Type of work");
  }

  private async selectWorkTypes(types: string[]) {
    const step = this.stepRegion("Type of work");
    await expect(step).toBeVisible();

    for (const t of types) {
      await step
        .getByRole("checkbox", { name: new RegExp(escapeRegExp(t), "i") })
        .check();
    }
  }

  private async setLocation(query: string, pick: string) {
    await expect(this.locationInput).toBeVisible();
    await this.locationInput.fill(query);

    await this.page
      .getByRole("option", { name: new RegExp(escapeRegExp(pick), "i") })
      .first()
      .click();
  }

  private async selectPropertyType(propertyType: string) {
    await this.propertyTypeBtn.click();
    await this.page.getByRole("option", { name: propertyType }).click();
  }

  private async selectBedrooms(bedrooms: number) {
    const target = bedrooms >= 6 ? "6+" : String(bedrooms);
    await this.bedroomsBtn.click();
    await this.page.getByRole("option", { name: target }).first().click();
  }

  // The UI's dropdown options mix hyphens and en-dashes (see
  // web/components/forms/DescriptionBuilder.tsx). These helpers let specs
  // use the "natural" hyphen form and the page object translates to the
  // exact label the UI renders. Mirrors EditProjectPage.
  private normalizeTimeframeLabel(label: string) {
    if (label === "Soon (2-4 weeks)") return "Soon (2–4 weeks)";
    if (label === "This quarter (1-3 months)")
      return "This quarter (1–3 months)";
    return label;
  }

  private normalizeBudgetLabel(label: string) {
    if (label === "£5k-£15k") return "£5k–£15k";
    if (label === "£15k-£30k") return "£15k–£30k";
    return label;
  }

  private async fillDescriptionStep(input: CreateProjectInput) {
    const timeframeLabel = this.normalizeTimeframeLabel(input.timeframe);
    const budgetLabel = this.normalizeBudgetLabel(input.budget);

    await this.timeframeBtn.click();
    await this.page.getByRole("option", { name: timeframeLabel }).click();

    await this.budgetBtn.click();
    await this.page.getByRole("option", { name: budgetLabel }).click();

    await this.materialsBtn.click();
    await this.page.getByRole("option", { name: input.materials }).click();

    await this.accessWrap
      .getByRole("button", {
        name: new RegExp(escapeRegExp(input.access), "i"),
      })
      .click();

    if (input.extraNotes) {
      await this.notesInput.fill(input.extraNotes);
    }

    await expect(this.preview).toBeVisible();

    await expect(this.preview).toContainText(
      `Timeframe: ${ensureEndsWithPeriod(timeframeLabel)}`,
    );
    await expect(this.preview).toContainText(
      `Budget: ${ensureEndsWithPeriod(budgetLabel)}`,
    );
    await expect(this.preview).toContainText(
      `Materials: ${ensureEndsWithPeriod(input.materials)}`,
    );
    await expect(this.preview).toContainText(
      `Access: ${ensureEndsWithPeriod(input.access)}`,
    );

    if (input.extraNotes) {
      await expect(this.preview).toContainText(input.extraNotes);
    }
  }

  async fillFlooringDetails(answers: FlooringAnswers) {
    const group = this.page.getByTestId("dynamic-group-flooring");
    await expect(group).toBeVisible();

    // Size (either field): click the visible label for m² or rooms, then type the value
    const sizeBase = "field-flooring-size";
    await group
      .getByTestId(`${sizeBase}-kind-${answers.size.kind}-label`)
      .click();
    const sizeValue = group.getByTestId(`${sizeBase}-value`);
    await sizeValue.fill(String(answers.size.value));

    // Floor type (select)
    await group
      .getByTestId("field-flooring-floor_type")
      .selectOption(answers.floor_type);

    // Removal
    const removalCheckbox = group.getByTestId("field-flooring-removal_required");
    const currentlyChecked = await removalCheckbox.isChecked();
    if (!!answers.removal_required !== currentlyChecked) {
      await removalCheckbox.click();
    }

    // Subfloor (conditional select, only when removal is required)
    if (answers.removal_required && answers.subfloor_condition) {
      await group
        .getByTestId("field-flooring-subfloor_condition")
        .selectOption(answers.subfloor_condition);
    }
  }

  private async assertReviewStep(input: CreateProjectInput) {
    const review = this.stepRegion("Review & create");
    await expect(review).toBeVisible();

    await expect(review).toContainText(input.category);
    for (const wt of input.workTypes) {
      await expect(review).toContainText(wt);
    }

    await expect(review).toContainText(input.locationPick);
    await expect(review).toContainText(input.propertyType);
    await expect(review).toContainText(String(input.bedrooms));

    await expect(review).toContainText(
      `Timeframe: ${ensureEndsWithPeriod(this.normalizeTimeframeLabel(input.timeframe))}`,
    );
    await expect(review).toContainText(
      `Budget: ${ensureEndsWithPeriod(this.normalizeBudgetLabel(input.budget))}`,
    );
    await expect(review).toContainText(
      `Materials: ${ensureEndsWithPeriod(input.materials)}`,
    );
    await expect(review).toContainText(
      `Access: ${ensureEndsWithPeriod(input.access)}`,
    );

    if (input.extraNotes) {
      await expect(review).toContainText(input.extraNotes);
    }
  }

  private async next() {
    await this.nextBtn.click();
  }

  private async waitForStep(title: string) {
    await expect(this.stepRegion(title)).toBeVisible({ timeout: 15_000 });
  }
}
