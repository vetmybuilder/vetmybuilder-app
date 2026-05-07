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
  readonly root: Locator;
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
    // /tradesman/profile/edit renders both a mobile (`trades-edit-profile-page`)
    // and a desktop (`trades-edit-profile-desktop`) tree, with the inactive
    // one CSS-hidden. Step + input testids exist inside both, so all child
    // locators must be scoped to whichever root is currently visible.
    this.root = page
      .getByTestId("trades-edit-profile-page")
      .or(page.getByTestId("trades-edit-profile-desktop"))
      .filter({ visible: true });

    this.step1Form = this.root.getByTestId("step-1");
    this.step2Form = this.root.getByTestId("step-2");
    this.step3Form = this.root.getByTestId("step-3");
    this.profileBadge = this.root.getByText("Profile", { exact: true }).first();
    this.nextButton = this.root.getByRole("button", { name: /^Next/ });
    this.saveButton = this.root.getByRole("button", { name: /save changes/i });

    this.contactNameInput = this.root.getByTestId("input-contact-name");
    this.phoneInput = this.root.getByTestId("input-phone");
    this.areasInput = this.root
      .getByTestId("input-areas")
      .locator("input")
      .first();
    this.websiteField = this.root.getByTestId("website-field");
    this.websiteInput = this.websiteField.locator("input").first();
    this.websiteRemoveButton = this.websiteField.getByRole("button", {
      name: /remove/i,
    });
    this.websiteAddButton = this.websiteField.getByRole("button", {
      name: /\+ add/i,
    });
    this.socialsToggle = this.root
      .getByTestId("socials")
      .locator("button")
      .first();
    this.reviewLinksToggle = this.root.getByTestId("btn-toggle-review-links");
    this.discountMaxInput = this.root.getByTestId("input-discount-max");
  }

  async goto() {
    await this.page.goto("/tradesman/profile/edit", {
      waitUntil: "domcontentloaded",
    });
    await expect(this.root).toBeVisible();
    await expect(this.step1Form).toBeVisible();
  }

  // The mobile tree is a stepped wizard (Next button between sections);
  // the desktop tree is a single page with every section visible at once.
  // If the requested form is already visible we're on desktop and the
  // step-nav is a no-op; otherwise click Next to advance the wizard.
  async goToStep2() {
    if (await this.step2Form.isVisible()) return;
    await this.nextButton.click();
    await expect(this.step2Form).toBeVisible();
  }

  async goToStep3() {
    if (await this.step3Form.isVisible()) return;
    await this.nextButton.click();
    await expect(this.step3Form).toBeVisible();
  }

  async save() {
    await this.saveButton.click();
    await expect(this.page).toHaveURL(/\/tradesman\/account/);
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
    // The area input is a typeahead: an outward like "E4" only commits
    // when the user picks a suggestion (Enter alone falls through to a
    // place-resolve that doesn't add a chip). Click the first suggestion;
    // every postcode/sector row commits the same outward.
    await this.root.locator('[role="option"]').first().click();
    const code = postcode.split(" ")[0].toUpperCase();
    await expect(
      this.root.locator(`[aria-label="Remove ${code}"]`),
    ).toBeVisible();
  }

  async removeServiceArea(label: string) {
    const code = label.toUpperCase();
    await this.root.locator(`[aria-label="Remove ${code}"]`).click();
    await expect(
      this.root.locator(`[aria-label="Remove ${code}"]`),
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
    if ((await this.root.getByTestId("socials-grid").count()) === 0) {
      await this.socialsToggle.click();
      await expect(this.root.getByTestId("socials-grid")).toBeVisible();
    }
  }

  async fillSocial(key: SocialKey, value: string) {
    await this.openSocials();
    const input = this.root.getByTestId(`social-${key}`).locator("input");
    await input.fill(value);
    await input.blur();
  }

  async openReviewLinks() {
    if ((await this.root.getByTestId("review-links-grid").count()) === 0) {
      await this.reviewLinksToggle.click();
      await expect(this.root.getByTestId("review-links-grid")).toBeVisible();
    }
  }

  async fillReviewLink(platform: ReviewPlatformKey, url: string) {
    await this.openReviewLinks();
    const input = this.root.getByTestId(`input-review-${platform}`);
    await input.fill(url);
    await input.blur();
    await expect(
      this.root.getByTestId(`error-review-${platform}`),
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
    await expect(this.profileBadge).toBeVisible();
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
    await this.root.getByTestId(`warranty-${option}`).click();
    await expect(
      this.root.getByTestId(`warranty-${option}`),
    ).toHaveAttribute("aria-pressed", "true");
  }

  // ---------- Reload-time assertions for non-public fields ----------

  async assertContactNameValue(value: string) {
    await expect(this.contactNameInput).toHaveValue(value);
  }

  async assertSocialValue(key: SocialKey, expected: string | RegExp) {
    await this.openSocials();
    await expect(
      this.root.getByTestId(`social-${key}`).locator("input"),
    ).toHaveValue(expected);
  }
}

export default TradesmanEditPage;
