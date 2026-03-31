import { expect, type Locator, type Page } from "@playwright/test";
import BasePage from "./BasePage";

export class TradesmanRegisterPage extends BasePage {
  readonly step1: Locator;
  readonly step2: Locator;
  readonly companyNameInput: Locator;
  readonly contactNameInput: Locator;
  readonly emailInput: Locator;
  readonly areasInput: Locator;
  readonly nextButton: Locator;
  readonly fileInput: Locator;
  readonly profileBadge: Locator;

  constructor(page: Page) {
    super(page);
    this.step1 = page.getByTestId("step-1");
    this.step2 = page.getByTestId("step-2");
    this.companyNameInput = page.getByTestId("input-company-name");
    this.contactNameInput = page.getByTestId("input-contact-name");
    this.emailInput = page.getByTestId("input-email");
    this.areasInput = page.getByTestId("input-areas").locator("input").first();
    this.nextButton = page.getByTestId("btn-next");
    this.fileInput = page.getByTestId("file-input");
    this.profileBadge = page.getByText("Profile", { exact: true });
  }

  async goto() {
    await this.page.goto("/tradesman/register-tradesmen", {
      waitUntil: "domcontentloaded",
    });
    await expect(this.step1).toBeVisible({ timeout: 15_000 });
  }

  async fillStep1(opts: {
    companyName: string;
    contactName: string;
    email: string;
  }) {
    await this.companyNameInput.fill(opts.companyName);
    await this.contactNameInput.fill(opts.contactName);
    await this.emailInput.fill(opts.email);
  }

  async addServiceArea(postcode: string) {
    await this.areasInput.fill(postcode);
    await this.areasInput.press("Enter");
    const outwardCode = postcode.split(" ")[0];
    await expect(
      this.page.locator(`[aria-label="Remove ${outwardCode}"]`),
    ).toBeVisible({ timeout: 5_000 });
  }

  async goToStep2() {
    await this.nextButton.click();
    await expect(this.step2).toBeVisible({ timeout: 15_000 });
  }

  async uploadPhotos(filePaths: string[]) {
    await this.fileInput.setInputFiles(filePaths);
  }

  async assertProfileBadgeVisible() {
    await expect(this.profileBadge.first()).toBeVisible({ timeout: 5_000 });
  }

  async assertProfileBadgeCount(count: number) {
    await expect(this.profileBadge).toHaveCount(count, { timeout: 5_000 });
  }

  async clickUnselectedPhoto() {
    const selectionButtons = this.page.getByRole("button", {
      name: /set as profile picture/i,
    });
    await selectionButtons.first().click();
  }
}

export default TradesmanRegisterPage;
