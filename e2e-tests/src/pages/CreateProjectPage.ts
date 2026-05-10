import { Page, Locator, expect } from "@playwright/test";
import type {
  ProjectCreateInput as CreateProjectInput,
  FlooringAnswers,
  InsulationAnswers,
} from "../models/Project";
import { escapeRegExp } from "../utils/formatters";

export class CreateProjectPage {
  readonly page: Page;

  private readonly nextBtn: Locator;
  private readonly createBtn: Locator;
  private readonly prevBtn: Locator;

  constructor(page: Page) {
    this.page = page;

    // Scope wizard nav buttons to the visible surface (the desktop and
    // mobile wizards both render the same testids in the DOM).
    this.nextBtn = this.surface.getByTestId("btn-next");
    this.createBtn = this.surface.getByTestId("btn-create");
    this.prevBtn = this.surface.getByTestId("btn-prev");
  }

  /**
   * The visible wizard surface. Both desktop (inside `main-content`)
   * and mobile (`post-job-mobile`) wizards mount the same testids, so
   * scope every lookup to whichever wrapper is visible for the
   * current viewport.
   */
  private get surface(): Locator {
    return this.page
      .getByTestId("post-job-mobile")
      .or(this.page.getByTestId("main-content"))
      .filter({ visible: true });
  }

  async createProject(
    input: CreateProjectInput,
    isMobile: boolean,
  ): Promise<string> {
    await this.page.goto("/projects/new", { waitUntil: "domcontentloaded" });
    await this.page.waitForURL("**/projects/new", { timeout: 30_000 });

    // Step 1: Category (auto-advances on click)
    await this.waitForStep("What do you need done?");
    await this.selectCategory(input.category);

    // Step 2: Work types
    await this.waitForStep("type of.*work", true);
    await this.selectWorkTypes(input.workTypes);
    await this.next();

    // Step 3: Location
    await this.waitForStep("Where is the job?");
    await this.setLocation(input.locationQuery, input.locationPick);
    await this.next();

    // Step 4: Property type (auto-advances on click)
    await this.waitForStep("What type of property?");
    await this.selectPropertyType(input.propertyType);

    // Step 5: Bedrooms (auto-advances on click)
    await this.waitForStep("How many bedrooms?");
    await this.selectBedrooms(input.bedrooms);

    // Dynamic step — only appears when the work type triggers a spec.
    if (input.flooringAnswers) {
      await this.waitForStep("About the floor");
      await this.fillFlooringDetails(input.flooringAnswers);
      await this.next();
    } else if (input.insulationAnswers) {
      await this.waitForStep("About the insulation job");
      await this.fillInsulationDetails(input.insulationAnswers);
      await this.next();
    }

    // Extras step: timeframe, budget, materials, access
    await this.waitForStep("A few more details");
    await this.fillExtrasStep(input);
    await this.next();

    // Description step (optional)
    await this.waitForStep("Describe the job");
    if (input.extraNotes) {
      await this.surface.getByTestId("field-description").fill(input.extraNotes);
    }
    await this.next();

    // Review step. Wizard now ends with a Preview step (step 9 of 9)
    // showing the homeowner's local matches before they post. Continue
    // through review, then submit from the preview step.
    await this.waitForStep("Review your job");
    await this.assertReviewStep(input);
    await this.next();

    // Preview step. Title varies based on whether we found local
    // matches or not, so wait for either form. The Create button
    // (btn-create) is the submit on this step regardless.
    await this.waitForStep(/Your local matches|We're still looking/i, true);

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
    const btn = this.surface.getByTestId(`category-${category}`);
    await expect(btn).toBeVisible({ timeout: 10_000 });
    await btn.click();
  }

  private async selectWorkTypes(types: string[]) {
    for (const t of types) {
      const chip = this.surface
        .getByTestId("field-subtypes")
        .getByRole("button", { name: new RegExp(escapeRegExp(t), "i") });
      await expect(chip).toBeVisible({ timeout: 5_000 });
      await chip.click();
    }
  }

  private async setLocation(query: string, pick: string) {
    const locationInput = this.surface.getByTestId("field-location-wrap").locator("input").first();
    await expect(locationInput).toBeVisible();
    await locationInput.fill(query);

    await this.page
      .getByRole("option", { name: new RegExp(escapeRegExp(pick), "i") })
      .first()
      .click();
  }

  private async selectPropertyType(propertyType: string) {
    const btn = this.surface.getByTestId(`property-${propertyType}`);
    await expect(btn).toBeVisible({ timeout: 5_000 });
    await btn.click();
  }

  private async selectBedrooms(bedrooms: number) {
    const target = bedrooms >= 6 ? "6+" : String(bedrooms);
    const btn = this.surface.getByTestId(`beds-${target}`);
    await expect(btn).toBeVisible({ timeout: 5_000 });
    await btn.click();
  }

  private async fillExtrasStep(input: CreateProjectInput) {
    // Timeframe
    if (input.timeframe) {
      const btn = this.surface.getByTestId("field-timeframe").getByRole("button", {
        name: new RegExp(escapeRegExp(input.timeframe), "i"),
      });
      await expect(btn).toBeVisible({ timeout: 5_000 });
      await btn.click();
    }

    // Budget
    if (input.budget) {
      const btn = this.surface.getByTestId("field-budget").getByRole("button", {
        name: new RegExp(escapeRegExp(input.budget), "i"),
      });
      await expect(btn).toBeVisible({ timeout: 5_000 });
      await btn.click();
    }

    // Materials
    if (input.materials) {
      const btn = this.surface.getByTestId("field-materials").getByRole("button", {
        name: new RegExp(escapeRegExp(input.materials), "i"),
      });
      await expect(btn).toBeVisible({ timeout: 5_000 });
      await btn.click();
    }

    // Access
    if (input.access) {
      const btn = this.surface.getByTestId("field-access").getByRole("button", {
        name: new RegExp(escapeRegExp(input.access), "i"),
      });
      await expect(btn).toBeVisible({ timeout: 5_000 });
      await btn.click();
    }
  }

  async fillFlooringDetails(answers: FlooringAnswers) {
    // Both desktop and mobile post-job wizards mount the same testid -
    // filter to the visible surface.
    const group = this.page
      .getByTestId("dynamic-group-flooring")
      .filter({ visible: true });
    await expect(group).toBeVisible();

    // Size (either field): click the visible label for m2 or rooms, then type the value
    const sizeBase = "field-flooring-size";
    await group
      .getByTestId(`${sizeBase}-kind-${answers.size.kind}-label`)
      .click();
    const sizeValue = group.getByTestId(`${sizeBase}-value`);
    await sizeValue.fill(String(answers.size.value));

    // Floor type — now rendered as tappable chips, not a native select
    const floorTypeBtn = group.getByTestId(`field-flooring-floor_type-${answers.floor_type}`);
    await expect(floorTypeBtn).toBeVisible({ timeout: 5_000 });
    await floorTypeBtn.click();

    // Removal — now a tappable chip button, not a checkbox
    if (answers.removal_required) {
      const removalBtn = group.getByTestId("field-flooring-removal_required");
      await removalBtn.click();
    }

    // Subfloor (conditional, only when removal is required) — now tappable chips
    if (answers.removal_required && answers.subfloor_condition) {
      const subfloorBtn = group.getByTestId(`field-flooring-subfloor_condition-${answers.subfloor_condition}`);
      await expect(subfloorBtn).toBeVisible({ timeout: 5_000 });
      await subfloorBtn.click();
    }
  }

  async fillInsulationDetails(answers: InsulationAnswers) {
    const group = this.page
      .getByTestId("dynamic-group-insulation")
      .filter({ visible: true });
    await expect(group).toBeVisible();

    if (typeof answers.area_m2 === "number") {
      await group
        .getByTestId("field-insulation-area_m2")
        .fill(String(answers.area_m2));
    }

    // Current state — now rendered as tappable chips, not a native select
    if (answers.current_state) {
      const stateBtn = group.getByTestId(`field-insulation-current_state-${answers.current_state}`);
      await expect(stateBtn).toBeVisible({ timeout: 5_000 });
      await stateBtn.click();
    }
  }

  private async assertReviewStep(input: CreateProjectInput) {
    const review = this.surface.getByTestId("step-title");
    await expect(review).toContainText("Review your job");

    const content = this.page.locator(".max-w-lg");
    await expect(content).toContainText(input.category);
    for (const wt of input.workTypes) {
      await expect(content).toContainText(wt);
    }
    await expect(content).toContainText(input.propertyType);
  }

  private async next() {
    await expect(this.nextBtn).toBeVisible({ timeout: 5_000 });
    await this.nextBtn.click();
  }

  private async waitForStep(title: string, isRegex = false) {
    const stepTitle = this.surface.getByTestId("step-title");
    if (isRegex) {
      await expect(stepTitle).toHaveText(new RegExp(title, "i"), { timeout: 15_000 });
    } else {
      await expect(stepTitle).toContainText(title, { timeout: 15_000 });
    }
  }
}
