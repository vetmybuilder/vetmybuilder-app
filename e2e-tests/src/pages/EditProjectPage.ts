import { expect, type Locator, type Page } from "@playwright/test";
import Project, {
  type FlooringAnswers,
  type InsulationAnswers,
} from "../models/Project";
import BasePage from "./BasePage";
import { escapeRegExp } from "../utils/formatters";

export class EditProjectPage extends BasePage {
  private readonly wizard: Locator;
  private readonly nextBtn: Locator;
  private readonly saveBtn: Locator;
  private readonly prevBtn: Locator;

  constructor(page: Page) {
    super(page);
    this.wizard = this.surface.getByTestId("wizard-edit");
    // Desktop edit wizard uses `wizard-next-edit` / `wizard-save-edit`;
    // mobile re-uses PostJobMobile's shared `btn-next` / `btn-create`.
    this.nextBtn = this.surface
      .getByTestId("wizard-next-edit")
      .or(this.surface.getByTestId("btn-next"));
    this.saveBtn = this.surface
      .getByTestId("wizard-save-edit")
      .or(this.surface.getByTestId("btn-create"));
    this.prevBtn = this.surface.getByTestId("btn-prev");
  }

  /**
   * The visible wizard surface. Both desktop (inside `main-content`)
   * and mobile (`post-job-mobile`) wizards mount the same testids, so
   * scope every lookup to whichever wrapper is visible.
   */
  private get surface(): Locator {
    return this.page
      .getByTestId("post-job-mobile")
      .or(this.page.getByTestId("main-content"))
      .filter({ visible: true });
  }

  async visit(projectId: string | number) {
    await this.page.goto(`/projects/${projectId}/edit`);
    await expect
      .poll(
        async () => {
          const editPage = this.surface.getByTestId("project-edit-page");
          const editVisible = await editPage.isVisible().catch(() => false);
          if (editVisible) return "OK";
          return `WAITING:${this.page.url()}`;
        },
        { timeout: 30_000, intervals: [200, 300, 500, 800, 1200] },
      )
      .toBe("OK");
  }

  async waitForStep(title: string) {
    const stepTitle = this.surface.getByTestId("step-title");
    await expect(stepTitle).toHaveText(new RegExp(title, "i"), { timeout: 15_000 });
  }

  async next() {
    await expect(this.nextBtn).toBeVisible({ timeout: 5_000 });
    await expect(this.nextBtn).toBeEnabled();
    await this.nextBtn.click();
  }

  async back() {
    await expect(this.prevBtn).toBeVisible();
    await this.prevBtn.click();
  }

  async save() {
    await expect(this.saveBtn).toBeVisible();
    await expect(this.saveBtn).toBeEnabled();
    // Wait for the PUT to finish AND the redirect to settle before
    // returning - otherwise tests that immediately read the project
    // back via the API race the in-flight PUT and see stale data.
    await Promise.all([
      this.page.waitForResponse(
        (res) =>
          /\/api\/projects\/\d+$/.test(new URL(res.url()).pathname) &&
          res.request().method() === "PUT",
        { timeout: 15_000 },
      ),
      this.saveBtn.click(),
    ]);
    await this.page.waitForURL(/\/projects\/\d+\/?(\?|$)/, {
      timeout: 15_000,
    });
  }

  async waitForWizard() {
    // Desktop wraps the edit form with `wizard-edit`; mobile reuses
    // PostJobMobile (no wizard-edit testid). Either signal counts.
    const ready = this.page
      .getByTestId("wizard-edit")
      .or(this.page.getByTestId("post-job-mobile"))
      .filter({ visible: true })
      .first();
    await expect(ready).toBeVisible({ timeout: 45_000 });
  }

  // Category — tappable icon cards (auto-advances)
  async selectCategory(category: string) {
    const btn = this.surface.getByTestId(`category-${category}`);
    await expect(btn).toBeVisible({ timeout: 10_000 });
    await btn.click();
  }

  // Work types — chip buttons
  async setWorkTypes(originalTypes: string[], nextTypes: string[]) {
    // Desktop edit uses `field-subtypes-edit`; mobile (PostJobMobile)
    // uses `field-subtypes`. Either-or, scoped to visible surface.
    const subtypesWrap = this.surface
      .getByTestId("field-subtypes-edit")
      .or(this.surface.getByTestId("field-subtypes"));

    // Uncheck originals by clicking their selected chips
    for (const t of originalTypes) {
      const chip = subtypesWrap.getByRole("button", {
        name: new RegExp(escapeRegExp(t), "i"),
      });
      const isSelected = await chip.getAttribute("class").then((c) => c?.includes("border-amber") ?? false).catch(() => false);
      if (isSelected) await chip.click();
    }

    // Check new ones
    for (const t of nextTypes) {
      const chip = subtypesWrap.getByRole("button", {
        name: new RegExp(escapeRegExp(t), "i"),
      });
      await expect(chip).toBeVisible({ timeout: 5_000 });
      await chip.click();
    }
  }

  // Property type — tappable cards (auto-advances)
  async selectPropertyType(propertyType: string) {
    const btn = this.surface.getByTestId(`property-${propertyType}`);
    await expect(btn).toBeVisible({ timeout: 5_000 });
    await btn.click();
  }

  // Bedrooms — number buttons (auto-advances)
  async selectBedrooms(bedrooms: number) {
    const target = bedrooms >= 6 ? "6+" : String(bedrooms);
    const btn = this.surface.getByTestId(`beds-${target}`);
    await expect(btn).toBeVisible({ timeout: 5_000 });
    await btn.click();
  }

  // Extras step — chip buttons for timeframe/budget/materials/access
  async fillExtrasStep(input: {
    timeframe?: string;
    budget?: string;
    materials?: string;
    access?: string;
  }) {
    if (input.timeframe) {
      const btn = this.surface.getByTestId("field-timeframe").getByRole("button", {
        name: new RegExp(escapeRegExp(input.timeframe), "i"),
      });
      await expect(btn).toBeVisible({ timeout: 5_000 });
      await btn.click();
    }
    if (input.budget) {
      const btn = this.surface.getByTestId("field-budget").getByRole("button", {
        name: new RegExp(escapeRegExp(input.budget), "i"),
      });
      await expect(btn).toBeVisible({ timeout: 5_000 });
      await btn.click();
    }
    if (input.materials) {
      const btn = this.surface.getByTestId("field-materials").getByRole("button", {
        name: new RegExp(escapeRegExp(input.materials), "i"),
      });
      await expect(btn).toBeVisible({ timeout: 5_000 });
      await btn.click();
    }
    if (input.access) {
      const btn = this.surface.getByTestId("field-access").getByRole("button", {
        name: new RegExp(escapeRegExp(input.access), "i"),
      });
      await expect(btn).toBeVisible({ timeout: 5_000 });
      await btn.click();
    }
  }

  // Dynamic flooring step — chips instead of native selects
  async fillFlooringDetails(answers: FlooringAnswers) {
    // Both desktop and mobile post-job wizards mount the same testid -
    // filter to the visible surface.
    const group = this.page
      .getByTestId("dynamic-group-flooring")
      .filter({ visible: true });
    await expect(group).toBeVisible();

    await group
      .getByTestId(`field-flooring-size-kind-${answers.size.kind}-label`)
      .click();
    await group
      .getByTestId("field-flooring-size-value")
      .fill(String(answers.size.value));

    await group
      .getByTestId(`field-flooring-floor_type-${answers.floor_type}`)
      .click();

    if (answers.removal_required) {
      await group.getByTestId("field-flooring-removal_required").click();
    }

    if (answers.removal_required && answers.subfloor_condition) {
      const btn = group.getByTestId(`field-flooring-subfloor_condition-${answers.subfloor_condition}`);
      await expect(btn).toBeVisible({ timeout: 5_000 });
      await btn.click();
    }
  }

  // Dynamic insulation step
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

    if (answers.current_state) {
      const btn = group.getByTestId(`field-insulation-current_state-${answers.current_state}`);
      await expect(btn).toBeVisible({ timeout: 5_000 });
      await btn.click();
    }
  }

  async assertReviewStep(expected: {
    workTypes: string[];
    propertyType: string;
  }) {
    const stepTitle = this.surface.getByTestId("step-title");
    await expect(stepTitle).toContainText("Review");

    // Desktop wraps the review block with `review-edit`; mobile renders
    // ReviewStep inline without that testid. Scope to whichever surface
    // is visible and assert the review content directly.
    for (const wt of expected.workTypes) {
      await expect(this.surface).toContainText(wt);
    }
    await expect(this.surface).toContainText(expected.propertyType);
  }

  async editProjectDetails(
    project: Project,
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
      flooringAnswers?: FlooringAnswers;
      insulationAnswers?: InsulationAnswers;
    },
  ) {
    const original = project.toCreateInput();

    await this.waitForWizard();

    await this.waitForStep("What do you need done");
    if (updates.category) {
      await this.selectCategory(updates.category);
    } else if (this.isMobile()) {
      // Mobile category click clears selectedTypes - re-selecting the
      // same category would wipe the workTypes we want to preserve.
      // Just advance instead.
      await this.next();
    } else {
      await this.selectCategory(original.category);
    }

    // Step 2: Subtypes
    await this.waitForStep("type of.*work");
    const categoryChanged = !!updates.category && updates.category !== original.category;
    if (updates.workTypes?.length) {
      // If category changed, old types were cleared — just select the new ones
      const typesToUncheck = categoryChanged ? [] : original.workTypes;
      await this.setWorkTypes(typesToUncheck, updates.workTypes);
    }
    await this.next();

    // Step 2: Property type (auto-advances on click)
    await this.waitForStep("What type of property");
    if (updates.propertyType) {
      await this.selectPropertyType(updates.propertyType);
    } else {
      await this.selectPropertyType(original.propertyType);
    }

    // Step 3: Bedrooms (auto-advances on click)
    await this.waitForStep("How many bedrooms");
    if (typeof updates.bedrooms === "number") {
      await this.selectBedrooms(updates.bedrooms);
    } else {
      await this.selectBedrooms(original.bedrooms);
    }

    // After bedrooms auto-advance the next step is dynamic - depends on
    // category. Wait for ANY of the three possible titles to land, then
    // dispatch. Replaces a 500ms sleep that was racing the auto-advance.
    const stepTitleEl = this.surface.getByTestId("step-title");
    await expect(stepTitleEl).toHaveText(
      /about the floor|about the insulation|a few more details/i,
      { timeout: 15_000 },
    );
    const currentTitle = (await stepTitleEl.textContent()) ?? "";

    if (/about the floor/i.test(currentTitle)) {
      if (updates.flooringAnswers) {
        await this.fillFlooringDetails(updates.flooringAnswers);
      }
      await this.next();
    } else if (/about the insulation/i.test(currentTitle)) {
      if (updates.insulationAnswers) {
        await this.fillInsulationDetails(updates.insulationAnswers);
      }
      await this.next();
    }

    // Extras step
    await this.waitForStep("A few more details");
    await this.fillExtrasStep({
      timeframe: updates.timeframe ?? original.timeframe,
      budget: updates.budget ?? original.budget,
      materials: updates.materials ?? original.materials,
      access: updates.access ?? original.access,
    });
    await this.next();

    // Description step
    await this.waitForStep("Describe the job");
    if (updates.extraNotes) {
      await this.surface.getByTestId("field-description").fill(updates.extraNotes);
    }
    await this.next();

    // Review step
    await this.waitForStep("Review");
    await this.assertReviewStep({
      workTypes: updates.workTypes ?? original.workTypes,
      propertyType: updates.propertyType ?? original.propertyType,
    });

    await this.save();
  }
}

export default EditProjectPage;
