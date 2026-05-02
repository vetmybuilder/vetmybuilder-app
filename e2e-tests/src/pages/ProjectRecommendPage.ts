import { expect, type Locator, type Page } from "@playwright/test";
import BasePage from "./BasePage";
import Account from "../models/Account";
import Recommendation, { type RecommendationInput } from "../models/Recommendation";

export type RecommendFieldKey =
  | "name"
  | "email"
  | "company"
  | "companyEmail"
  | "phone"
  | "comment";

const FIELD_ERROR_TESTID: Record<RecommendFieldKey, string> = {
  name: "recommend-name-error",
  email: "recommend-email-error",
  company: "recommend-company-error",
  companyEmail: "recommend-company-email-error",
  phone: "recommend-phone-error",
  comment: "recommend-comment-error",
};

// Both viewports use the same input testids and field labels (mobile uses
// the same `recommend-{id}` ids as desktop). Star buttons are the only
// asymmetry: mobile has a testid, desktop does not — but both share the
// same aria-label, so we drive both surfaces through the aria-label.
const RATING_CATEGORIES = [
  { key: "quality" as const, label: "Quality of work" },
  { key: "reliability" as const, label: "Reliability" },
  { key: "communication" as const, label: "Communication" },
  { key: "trust" as const, label: "Trust" },
  { key: "value" as const, label: "Value for money" },
];

type RatingKey = (typeof RATING_CATEGORIES)[number]["key"];

export class ProjectRecommendPage extends BasePage {
  readonly heading: Locator;
  readonly nameInput: Locator;
  readonly emailInput: Locator;
  readonly companyInput: Locator;
  readonly companyEmailInput: Locator;
  readonly phoneInput: Locator;
  readonly commentInput: Locator;
  readonly fileInput: Locator;
  readonly submitButton: Locator;
  readonly continueButton: Locator;
  readonly mobileSuccess: Locator;

  constructor(page: Page) {
    super(page);

    // Both desktop and mobile mount their h1 with "How did they do?"
    // (split into spans on desktop, plain text on mobile). Match on a
    // partial heading name and filter to the visible one.
    this.heading = page
      .getByRole("heading", { name: /How did/i })
      .filter({ visible: true });

    this.nameInput = page.getByTestId("recommend-name");
    this.emailInput = page.getByTestId("recommend-email");
    this.companyInput = page.getByTestId("recommend-company");
    this.companyEmailInput = page.getByTestId("recommend-company-email");
    this.phoneInput = page.getByTestId("recommend-phone");
    this.commentInput = page.getByTestId("recommend-comment");
    this.fileInput = page.locator('input[type="file"]');

    // Mobile renders a "Send" button with testid; desktop renders
    // a button labelled "Send recommendation". Either-or, visible only.
    this.submitButton = page
      .getByTestId("recommend-mobile-submit")
      .or(page.getByRole("button", { name: /^Send recommendation$/i }))
      .filter({ visible: true });

    this.continueButton = page.getByTestId("recommend-mobile-continue");
    this.mobileSuccess = page.getByTestId("recommend-mobile-success");
  }

  isMobile(): boolean {
    const vp = this.page.viewportSize();
    return vp ? vp.width < 768 : false;
  }

  starButton(category: RatingKey, n: number): Locator {
    const cat = RATING_CATEGORIES.find((c) => c.key === category);
    if (!cat) throw new Error(`Unknown rating category: ${category}`);
    // Both viewports share the same aria-label for star buttons.
    return this.page
      .getByRole("button", { name: `${cat.label}: ${n} of 5 stars` })
      .filter({ visible: true });
  }

  fieldError(field: RecommendFieldKey): Locator {
    return this.page.getByTestId(FIELD_ERROR_TESTID[field]);
  }

  async assertFieldError(
    field: RecommendFieldKey,
    expectedMessage: string | RegExp,
  ) {
    const locator = this.fieldError(field);
    await expect(locator).toBeVisible({ timeout: 10_000 });
    await expect(locator).toHaveText(expectedMessage);
  }

  async submitForm() {
    await this.submitButton.click();
  }

  async visit(projectId: string | number) {
    await this.page.goto(`/projects/${projectId}/recommend`);
    await expect(this.page).toHaveURL(`/projects/${projectId}/recommend`);
    await expect(this.heading).toBeVisible();
  }

  async hasPrefilledIdentity(account: Account) {
    await expect(this.nameInput).toBeDisabled();
    await expect(this.emailInput).toBeDisabled();

    await expect(this.nameInput).toHaveValue(
      `${account.firstName} ${account.lastName}`.trim(),
    );
    await expect(this.emailInput).toHaveValue(account.email!);
  }

  /** Set the 5 category star ratings from the model (defaults to 5). */
  async setRatingsFromModel(rec: Recommendation) {
    const ratings: Record<RatingKey, number | undefined> = {
      quality: rec.qualityRating,
      reliability: rec.reliabilityRating,
      communication: rec.communicationRating,
      trust: rec.trustRating,
      value: rec.valueRating,
    };
    for (const cat of RATING_CATEGORIES) {
      const n = ratings[cat.key];
      if (n && n >= 1 && n <= 5) {
        await this.starButton(cat.key, n).click();
      }
    }
  }

  /** Mobile-only: advance from Step 1 to Step 2. No-op on desktop. */
  async goToStep2() {
    if (!this.isMobile()) return;
    // Continue is gated on at least one star rating - tap quality:5
    // unless something is already set so the button enables.
    const enabled = await this.continueButton
      .isEnabled()
      .catch(() => false);
    if (!enabled) {
      await this.starButton("quality", 5).click();
      await expect(this.continueButton).toBeEnabled();
    }
    await this.continueButton.click();
    // Step 2 renders the company input - wait until it's visible.
    await expect(this.companyInput).toBeVisible({ timeout: 5_000 });
  }

  private async attachPhotos(photos: string[] | undefined) {
    if (!photos?.length) return;
    await this.fileInput.setInputFiles(photos);
    await this.page
      .getByRole("button", { name: /Remove/i })
      .first()
      .waitFor({ state: "visible", timeout: 5_000 })
      .catch(() => {});
    // Photo Acceptable Use Policy consent - the FileGridUploader renders
    // a checkbox below the grid once any file is attached, and the submit
    // button is disabled until it's ticked.
    await this.page
      .getByTestId("photo-consent-checkbox")
      .check({ timeout: 5_000 })
      .catch(() => {});
  }

  /** Fill the Step 2 (or desktop) tradesperson + recommender fields. */
  private async fillStep2Fields(
    fields: RecommendationInput,
    options: { fillIdentity: boolean; identityName?: string; identityEmail?: string },
  ) {
    await this.companyInput.fill(fields.company);
    if (fields.companyEmail) {
      await this.companyEmailInput.fill(fields.companyEmail);
    }
    if (fields.phone) {
      await this.phoneInput.fill(fields.phone);
    }
    if (options.fillIdentity) {
      if (options.identityName) {
        await this.nameInput.fill(options.identityName);
      }
      if (options.identityEmail) {
        await this.emailInput.fill(options.identityEmail);
      }
    }
  }

  async submitRecommendationForLoggedInUser(
    account: Account,
    recommendation: Recommendation,
  ) {
    const payload = recommendation.toMultipartPayload();
    const { fields, photos } = payload;

    // Mobile: ratings + comment live on Step 1. Desktop: same form,
    // no step navigation needed.
    await this.setRatingsFromModel(recommendation);

    if (this.isMobile()) {
      // Comment lives on Step 1 (mobile) - fill before advancing.
      await this.commentInput.fill(fields.comment);
      await this.goToStep2();
    } else {
      await this.commentInput.fill(fields.comment);
    }

    // Identity is locked for logged-in users on Step 2 / desktop section.
    await this.hasPrefilledIdentity(account);

    // Photos sit between the tradesperson and recommender sections.
    await this.attachPhotos(photos);

    await this.fillStep2Fields(fields, { fillIdentity: false });

    await this.submitButton.click();
    // Wait for the success indicator before returning so the post-redirect
    // navigation is observable to the caller.
    await this.waitForSubmissionSuccess();
  }

  async submitRecommendationForGuestUser(
    guest: Account,
    recommendation: Recommendation,
    _projectId: string | number,
  ) {
    const payload = recommendation.toMultipartPayload();
    const { fields, photos } = payload;

    await this.setRatingsFromModel(recommendation);

    if (this.isMobile()) {
      await this.commentInput.fill(fields.comment);
      await this.goToStep2();
    } else {
      await this.commentInput.fill(fields.comment);
    }

    // Guest banner appears on Step 2 (mobile) / inline (desktop).
    await expect(
      this.page
        .getByText(/You can submit without an account/i)
        .filter({ visible: true })
        .first(),
    ).toBeVisible();

    await this.attachPhotos(photos);

    await this.fillStep2Fields(fields, {
      fillIdentity: true,
      identityName: `${guest.firstName} ${guest.lastName}`.trim(),
      identityEmail: guest.requiredEmail,
    });

    await this.submitButton.click();
    await this.waitForSubmissionSuccess();
    // Guests get redirected to '/' after the success view (~2.5s).
    await expect(this.page).toHaveURL("/", { timeout: 15_000 });
  }

  /**
   * Submission success surfaces differently per viewport:
   *   - Mobile: full-screen takeover with `recommend-mobile-success`
   *   - Desktop: inline emerald notice banner
   * Either confirms the POST succeeded.
   */
  async waitForSubmissionSuccess() {
    if (this.isMobile()) {
      await expect(this.mobileSuccess).toBeVisible({ timeout: 10_000 });
      return;
    }
    await expect(
      this.page.getByText(/Your recommendation for .* has been sent/i),
    ).toBeVisible({ timeout: 10_000 });
  }
}

export default ProjectRecommendPage;
