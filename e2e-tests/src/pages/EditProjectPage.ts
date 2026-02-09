import { expect, type Locator, type Page } from "@playwright/test";
import type { ProjectCreateInput as CreateProjectInput } from "../models/Project";
import BasePage from "./BasePage";
import { ensureEndsWithPeriod } from "../utils/formatters";

export class EditProjectPage extends BasePage {
  // Wizard root (used to scope active step)
  private readonly wizard: Locator;

  // Step fields
  private readonly categoryField: Locator;
  private readonly subtypesWrap: Locator;
  private readonly locationReadonly: Locator;
  private readonly locationHelpText: Locator;

  private readonly propertyTypeField: Locator;
  private readonly bedroomsField: Locator;

  // Description builder (same IDs as create)
  private readonly timeframeBtn: Locator;
  private readonly budgetBtn: Locator;
  private readonly materialsBtn: Locator;

  private readonly accessWrap: Locator;
  private readonly notesInput: Locator;
  private readonly preview: Locator;

  // Review
  private readonly reviewName: Locator;
  private readonly reviewCategory: Locator;
  private readonly reviewTypes: Locator;
  private readonly reviewLocation: Locator;
  private readonly reviewProperty: Locator;
  private readonly reviewBedrooms: Locator;
  private readonly reviewDescription: Locator;

  constructor(page: Page) {
    super(page);

    this.wizard = page.getByTestId("wizard-edit");

    this.categoryField = page.getByTestId("field-category-edit");
    this.subtypesWrap = page.getByTestId("field-subtypes-edit");

    this.locationReadonly = page.getByTestId("field-location-readonly");
    this.locationHelpText = page.getByText(
      "Location is fixed for this project. If it’s wrong, please close this project and create a new one.",
      { exact: true },
    );

    this.propertyTypeField = page.getByTestId("field-property-edit");
    this.bedroomsField = page.getByTestId("field-bedrooms-edit");

    this.timeframeBtn = page.locator("#db-timeframe-button");
    this.budgetBtn = page.locator("#db-budget-button");
    this.materialsBtn = page.locator("#db-materials-button");

    this.accessWrap = page.getByTestId("db-access");
    this.notesInput = page.getByTestId("db-notes");
    this.preview = page.getByTestId("db-preview");

    this.reviewName = page.getByTestId("review-name-edit");
    this.reviewCategory = page.getByTestId("review-category-edit");
    this.reviewTypes = page.getByTestId("review-types-edit");
    this.reviewLocation = page.getByTestId("review-location-edit");
    this.reviewProperty = page.getByTestId("review-property-edit");
    this.reviewBedrooms = page.getByTestId("review-bedrooms-edit");
    this.reviewDescription = page.getByTestId("review-description-edit");
  }

  private stepRegion(title: string) {
    return this.page
      .getByRole("region", { name: new RegExp(title, "i") })
      .first();
  }

  /**
   * Only one wizard section is "active" at a time.
   * In the DOM, all steps exist, but inactive ones are aria-hidden="true".
   */
  private activeStep() {
    return this.wizard
      .locator('section[role="region"]:not([aria-hidden="true"])')
      .first();
  }

  async visit(projectId: string | number) {
    await this.page.goto(`/projects/${projectId}/edit`);
    await expect(this.page.getByTestId("project-edit-page")).toBeVisible();
  }

  async waitForStep(title: string) {
    await expect(this.stepRegion(title)).toBeVisible();
  }

  async next() {
    const step = this.activeStep();
    const nextBtn = step.getByTestId("wizard-next-edit");
    await expect(nextBtn).toBeVisible();
    await expect(nextBtn).toBeEnabled();
    await nextBtn.click();
  }

  async back() {
    const step = this.activeStep();
    const backBtn = step.getByTestId("wizard-back-edit");
    await expect(backBtn).toBeVisible();
    await backBtn.click();
  }

  async save() {
    const step = this.activeStep();
    const saveBtn = step.getByRole("button", { name: "Save changes" });

    await expect(saveBtn).toBeEnabled();
    await saveBtn.click();
  }

  /* =======================
   * Select helpers (your Select is button + listbox)
   * ======================= */

  private async assertSelectButtonShows(root: Locator, expectedLabel: string) {
    const btn = root.getByRole("button").first();
    await expect(btn).toBeVisible();
    await expect(btn).toContainText(expectedLabel);
  }

  private async chooseSelectOption(root: Locator, label: string) {
    const btn = root.getByRole("button").first();
    await expect(btn).toBeVisible();
    await btn.click();

    // listbox is created only when open; scope to the active step to avoid collisions
    const step = this.activeStep();
    const option = step.getByRole("option", { name: label, exact: true });

    await expect(option).toBeVisible();
    await option.click();
  }

  /**
   * UI uses en-dash in some labels. Test data sometimes uses hyphen.
   * Keep this simple and explicit – only normalize the known cases.
   */
  private normalizeTimeframeLabel(label: string) {
    if (label === "Soon (2-4 weeks)") return "Soon (2–4 weeks)";
    return label;
  }

  private normalizeBudgetLabel(label: string) {
    if (label === "£5k-£15k") return "£5k–£15k";
    if (label === "£15k-£30k") return "£15k–£30k";
    return label;
  }

  /* =======================
   * Step: Category
   * ======================= */

  async assertCategorySelected(expectedCategory: string) {
    await expect(this.categoryField).toBeVisible();
    await this.assertSelectButtonShows(this.categoryField, expectedCategory);
  }

  async selectCategory(category: string) {
    await expect(this.categoryField).toBeVisible();
    await this.chooseSelectOption(this.categoryField, category);
  }

  /* =======================
   * Step: Type of work
   * ======================= */

  async assertWorkTypesChecked(expectedTypes: string[]) {
    await expect(this.subtypesWrap).toBeVisible();

    for (const t of expectedTypes) {
      const checkbox = this.subtypesWrap
        .locator("label", { hasText: t })
        .locator('input[type="checkbox"]');

      await expect(checkbox).toBeChecked();
    }
  }

  async setWorkTypes(originalTypes: string[], nextTypes: string[]) {
    // uncheck originals
    for (const t of originalTypes) {
      const checkbox = this.subtypesWrap
        .locator("label", { hasText: t })
        .locator('input[type="checkbox"]');

      if (await checkbox.isChecked()) {
        await checkbox.uncheck();
      }
    }

    // check new ones
    for (const t of nextTypes) {
      const checkbox = this.subtypesWrap
        .locator("label", { hasText: t })
        .locator('input[type="checkbox"]');

      await checkbox.check();
    }
  }

  /* =======================
   * Step: Location (readonly)
   * ======================= */

  async assertLocationReadonly(expectedLocationPick: string) {
    await expect(this.locationReadonly).toBeVisible();

    // UI only shows partial, e.g. "E4"
    const partial = expectedLocationPick.split(" ")[0];
    await expect(this.locationReadonly).toHaveText(partial);

    await expect(this.locationReadonly.locator("input")).toHaveCount(0);
    await expect(this.locationHelpText).toBeVisible();
  }

  /* =======================
   * Step: Property type
   * ======================= */

  async assertPropertyTypeSelected(expected: string) {
    await expect(this.propertyTypeField).toBeVisible();
    await this.assertSelectButtonShows(this.propertyTypeField, expected);
  }

  async selectPropertyType(propertyType: string) {
    await expect(this.propertyTypeField).toBeVisible();
    await this.chooseSelectOption(this.propertyTypeField, propertyType);
  }

  /* =======================
   * Step: Bedrooms / rooms
   * ======================= */

  private roomsOptionLabel(rooms: number) {
    return rooms >= 6 ? "6+" : String(rooms);
  }

  async assertRoomsSelected(expectedRooms: number) {
    await expect(this.bedroomsField).toBeVisible();
    await expect(this.bedroomsField).toContainText(
      this.roomsOptionLabel(expectedRooms),
    );
  }

  async selectBedrooms(bedrooms: number) {
    const target = this.roomsOptionLabel(bedrooms);

    await expect(this.bedroomsField).toBeVisible();
    await this.bedroomsField.getByRole("button").first().click();

    const option = this.page.getByRole("option", { name: target, exact: true });
    await expect(option).toBeVisible();
    await option.click();
  }

  /* =======================
   * Step: Brief description (DescriptionBuilder)
   * ======================= */

  async assertDescriptionRepopulated(originalDescription: string) {
    await expect(this.preview).toBeVisible();
    await expect(this.preview).toContainText(originalDescription);
  }

  async fillDescriptionStep(input: {
    timeframe: string;
    budget: string;
    materials: string;
    access: string;
    extraNotes?: string;
  }) {
    const timeframe = this.normalizeTimeframeLabel(input.timeframe);
    const budget = this.normalizeBudgetLabel(input.budget);

    await this.timeframeBtn.click();
    await this.page
      .getByRole("option", { name: timeframe, exact: true })
      .click();

    await this.budgetBtn.click();
    await this.page.getByRole("option", { name: budget, exact: true }).click();

    await this.materialsBtn.click();
    await this.page
      .getByRole("option", { name: input.materials, exact: true })
      .click();

    await this.accessWrap.getByRole("button", { name: input.access }).click();

    if (input.extraNotes) {
      await this.notesInput.fill(input.extraNotes);
    }

    await expect(this.preview).toBeVisible();

    await expect(this.preview).toContainText(
      `Timeframe: ${ensureEndsWithPeriod(timeframe)}`,
    );
    await expect(this.preview).toContainText(
      `Budget: ${ensureEndsWithPeriod(budget)}`,
    );
    await expect(this.preview).toContainText(
      `Materials: ${ensureEndsWithPeriod(input.materials)}`,
    );

    await expect(this.preview).toContainText("Access:");
    await expect(this.preview).toContainText(input.access);

    if (input.extraNotes) {
      await expect(this.preview).toContainText(input.extraNotes);
    }
  }

  /* =======================
   * Step: Review
   * ======================= */

  async assertReviewStep(expected: {
    category: string;
    workTypes: string[];
    locationPick: string;
    propertyType: string;
    bedrooms: number;
    descriptionIncludes?: string;
  }) {
    const review = this.stepRegion("Review & save");
    await expect(review).toBeVisible();

    await expect(this.reviewName).toBeVisible();
    await expect(this.reviewCategory).toContainText(expected.category);

    for (const wt of expected.workTypes) {
      await expect(this.reviewTypes).toContainText(wt);
    }

    // Edit UI shows partial location only (e.g. "E4")
    const partial = expected.locationPick.split(" ")[0];
    await expect(this.reviewLocation).toHaveText(partial);

    await expect(this.reviewProperty).toContainText(expected.propertyType);
    await expect(this.reviewBedrooms).toContainText(String(expected.bedrooms));

    if (expected.descriptionIncludes) {
      await expect(this.reviewDescription).toContainText(
        expected.descriptionIncludes,
      );
    }
  }

  /**
   * Convenience flow that first asserts original values are present, then performs edits.
   */
  async editProjectDetails(
    original: CreateProjectInput,
    updates: {
      category?: string;
      workTypes?: string[];
      propertyType?: string;
      bedrooms?: number;
      timeframe?: string;
      budget?: string;
      materials?: string;
      access?: string;
      extraNotes?: string;
    },
  ) {
    // Category
    await this.waitForStep("Category");
    await this.assertCategorySelected(original.category);
    if (updates.category) await this.selectCategory(updates.category);
    await this.next();

    // Type of work
    await this.waitForStep("Type of work");
    await this.assertWorkTypesChecked(original.workTypes);
    if (updates.workTypes?.length) {
      await this.setWorkTypes(original.workTypes, updates.workTypes);
    }
    await this.next();

    // Location
    await this.waitForStep("Location");
    await this.assertLocationReadonly(original.locationPick);
    await this.next();

    // Property type
    await this.waitForStep("Property type");
    await this.assertPropertyTypeSelected(original.propertyType);
    if (updates.propertyType)
      await this.selectPropertyType(updates.propertyType);
    await this.next();

    // Rooms
    await this.waitForStep("Number of rooms");
    await this.assertRoomsSelected(original.bedrooms);
    if (typeof updates.bedrooms === "number") {
      await this.selectBedrooms(updates.bedrooms);
    }
    await this.next();

    // Brief description
    await this.waitForStep("Brief description");
    if (original.extraNotes) {
      await this.assertDescriptionRepopulated(original.extraNotes);
    }

    if (
      updates.timeframe ||
      updates.budget ||
      updates.materials ||
      updates.access ||
      updates.extraNotes
    ) {
      await this.fillDescriptionStep({
        timeframe: updates.timeframe ?? original.timeframe,
        budget: updates.budget ?? original.budget,
        materials: updates.materials ?? original.materials,
        access: updates.access ?? original.access,
        extraNotes: updates.extraNotes,
      });
    }

    await this.next();

    // Review
    await this.waitForStep("Review & save");
    await this.assertReviewStep({
      category: updates.category ?? original.category,
      workTypes: updates.workTypes ?? original.workTypes,
      locationPick: original.locationPick,
      propertyType: updates.propertyType ?? original.propertyType,
      bedrooms: updates.bedrooms ?? original.bedrooms,
      descriptionIncludes: updates.extraNotes,
    });

    await this.save();
    await this.page.waitForURL(/\/projects\/[^/]+$/);
  }
}

export default EditProjectPage;
