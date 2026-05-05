import { expect, type Locator, type Page } from "@playwright/test";
import BasePage from "./BasePage";

type SocialKey =
  | "instagram"
  | "tiktok"
  | "facebook"
  | "x"
  | "youtube"
  | "linkedin";

type ReviewPlatformKey =
  | "trustpilot"
  | "bark"
  | "mybuilder"
  | "checkatrade"
  | "houzz"
  | "yell";

type WarrantyOption = "none" | "3m" | "6m" | "12m" | "24m+";

export class TradesmanEditPage extends BasePage {
  readonly step1Form: Locator;
  readonly step2Form: Locator;
  readonly step3Form: Locator;
  readonly profileBadge: Locator;
  readonly nextButton: Locator;
  readonly saveButton: Locator;

  readonly contactNameInput: Locator;
  readonly phoneInput: Locator;
  readonly areasInput: Locator;
  readonly websiteField: Locator;
  readonly websiteInput: Locator;
  readonly websiteRemoveButton: Locator;
  readonly websiteAddButton: Locator;
  readonly socialsToggle: Locator;
  readonly reviewLinksToggle: Locator;
  readonly discountMaxInput: Locator;

  constructor(page: Page) {
    super(page);
    this.step1Form = page.getByTestId("step-1");
    this.step2Form = page.getByTestId("step-2");
    this.step3Form = page.getByTestId("step-3");
    this.profileBadge = page.getByText("Profile", { exact: true }).first();
    this.nextButton = page.getByRole("button", { name: /^Next/ });
    this.saveButton = page.getByRole("button", { name: /save changes/i });

    this.contactNameInput = page.getByTestId("input-contact-name");
    this.phoneInput = page.getByTestId("input-phone");
    this.areasInput = page.getByTestId("input-areas").locator("input").first();
    this.websiteField = page.getByTestId("website-field");
    this.websiteInput = this.websiteField.locator("input").first();
    this.websiteRemoveButton = this.websiteField.getByRole("button", {
      name: /remove/i,
    });
    this.websiteAddButton = this.websiteField.getByRole("button", {
      name: /\+ add/i,
    });
    this.socialsToggle = page.getByTestId("socials").locator("button").first();
    this.reviewLinksToggle = page.getByTestId("btn-toggle-review-links");
    this.discountMaxInput = page.getByTestId("input-discount-max");
  }

  async goto() {
    await this.page.goto("/tradesman/profile/edit", {
      waitUntil: "domcontentloaded",
    });
    await expect(
      this.page.getByTestId("trades-edit-profile-page"),
    ).toBeVisible({ timeout: 20_000 });
    await expect(this.step1Form).toBeVisible({ timeout: 10_000 });
  }

  async goToStep2() {
    await this.nextButton.click();
    await expect(this.step2Form).toBeVisible({ timeout: 10_000 });
  }

  async goToStep3() {
    await this.nextButton.click();
    await expect(this.step3Form).toBeVisible({ timeout: 10_000 });
  }

  async save() {
    await this.saveButton.click();
    await expect(this.page).toHaveURL(/\/tradesman\/account/, {
      timeout: 20_000,
    });
  }

  // ---------- Step 1: company details ----------

  async fillContactName(value: string) {
    await this.contactNameInput.fill(value);
  }

  async fillPhone(value: string) {
    await this.phoneInput.fill(value);
  }

  async addServiceArea(postcode: string) {
    await this.areasInput.fill(postcode);
    await this.areasInput.press("Enter");
    const code = postcode.split(" ")[0].toUpperCase();
    await expect(
      this.page.locator(`[aria-label="Remove ${code}"]`),
    ).toBeVisible({ timeout: 5_000 });
  }

  async removeServiceArea(label: string) {
    const code = label.toUpperCase();
    await this.page.locator(`[aria-label="Remove ${code}"]`).click();
    await expect(
      this.page.locator(`[aria-label="Remove ${code}"]`),
    ).toHaveCount(0);
  }

  async clearWebsite() {
    if ((await this.websiteRemoveButton.count()) > 0) {
      await this.websiteRemoveButton.click();
    }
    await expect(this.websiteInput).toBeVisible();
  }

  async fillWebsite(url: string) {
    await this.clearWebsite();
    await this.websiteInput.fill(url);
    await this.websiteAddButton.click();
    await expect(this.websiteField.getByRole("link")).toBeVisible({
      timeout: 5_000,
    });
  }

  async openSocials() {
    if ((await this.page.getByTestId("socials-grid").count()) === 0) {
      await this.socialsToggle.click();
      await expect(this.page.getByTestId("socials-grid")).toBeVisible();
    }
  }

  async fillSocial(key: SocialKey, value: string) {
    await this.openSocials();
    const input = this.page.getByTestId(`social-${key}`).locator("input");
    await input.fill(value);
    await input.blur();
  }

  async openReviewLinks() {
    if ((await this.page.getByTestId("review-links-grid").count()) === 0) {
      await this.reviewLinksToggle.click();
      await expect(this.page.getByTestId("review-links-grid")).toBeVisible();
    }
  }

  async fillReviewLink(platform: ReviewPlatformKey, url: string) {
    await this.openReviewLinks();
    const input = this.page.getByTestId(`input-review-${platform}`);
    await input.fill(url);
    await input.blur();
    await expect(
      this.page.getByTestId(`error-review-${platform}`),
    ).toHaveCount(0);
  }

  // ---------- Step 2: trades + photos ----------

  async toggleTradeType(label: string) {
    await this.step2Form
      .getByRole("button", { name: label, exact: true })
      .first()
      .click();
  }

  async assertProfileBadgeVisible() {
    await expect(this.profileBadge).toBeVisible({ timeout: 10_000 });
  }

  async assertProfileBadgeCount(count: number) {
    const badges = this.step2Form.getByText("Profile", { exact: true });
    await expect(badges).toHaveCount(count);
  }

  /** Click the nth existing photo (0-indexed) in the profile picture grid */
  async clickExistingPhoto(index: number) {
    const buttons = this.step2Form.getByRole("button", {
      name: /set as profile picture|deselect as profile picture/i,
    });
    await buttons.nth(index).click();
  }

  // ---------- Step 3: offers + warranty ----------

  async setDiscountMax(percent: number) {
    await this.discountMaxInput.evaluate((el, value) => {
      const input = el as HTMLInputElement;
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set;
      setter?.call(input, String(value));
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }, percent);
    await expect(this.discountMaxInput).toHaveValue(String(percent));
  }

  async setWarranty(option: WarrantyOption) {
    await this.page.getByTestId(`warranty-${option}`).click();
    await expect(
      this.page.getByTestId(`warranty-${option}`),
    ).toHaveAttribute("aria-pressed", "true");
  }

  // ---------- Reload-time assertions for non-public fields ----------

  async assertContactNameValue(value: string) {
    await expect(this.contactNameInput).toHaveValue(value);
  }

  async assertSocialValue(key: SocialKey, expected: string | RegExp) {
    await this.openSocials();
    await expect(
      this.page.getByTestId(`social-${key}`).locator("input"),
    ).toHaveValue(expected);
  }
}

export default TradesmanEditPage;
