import { expect, type Locator, type Page } from "@playwright/test";
import BasePage from "./BasePage";

export class TradesmanEditPage extends BasePage {
  readonly step2Form: Locator;
  readonly step3Form: Locator;
  readonly profileBadge: Locator;
  readonly nextFromStep2: Locator;
  readonly saveButton: Locator;

  constructor(page: Page) {
    super(page);
    this.step2Form = page.getByTestId("step-2");
    this.step3Form = page.getByTestId("step-3");
    this.profileBadge = page.getByText("Profile", { exact: true }).first();
    this.nextFromStep2 = page.getByTestId("btn-continue").first();
    this.saveButton = page.getByTestId("btn-continue").last();
  }

  async goto() {
    await this.page.goto("/tradesman/profile/edit", {
      waitUntil: "domcontentloaded",
    });
    await expect(
      this.page.getByTestId("trades-edit-profile-page")
    ).toBeVisible({ timeout: 20_000 });
  }

  async goToStep2() {
    // Click the "2" step button in the stepper
    await this.page
      .getByRole("button", { name: /trades.*photos|2/i })
      .first()
      .click();
    await expect(this.step2Form).toBeVisible({ timeout: 10_000 });
  }

  async assertProfileBadgeVisible() {
    await expect(this.profileBadge).toBeVisible({ timeout: 10_000 });
  }

  /** Click the nth existing photo (0-indexed) in the profile picture grid */
  async clickExistingPhoto(index: number) {
    const buttons = this.step2Form.getByRole("button", {
      name: /set as profile picture|deselect as profile picture/i,
    });
    await buttons.nth(index).click();
  }

  /** Click Next on step 2 to advance to step 3 */
  async goToStep3() {
    await this.step2Form.getByTestId("btn-continue").click();
    await expect(this.step3Form).toBeVisible({ timeout: 10_000 });
  }

  /** Click Save on step 3 */
  async save() {
    await this.step3Form.getByTestId("btn-continue").click();
    // Wait for success redirect
    await expect(this.page).toHaveURL(/\/tradesman\/projects/, {
      timeout: 20_000,
    });
  }
}

export default TradesmanEditPage;
