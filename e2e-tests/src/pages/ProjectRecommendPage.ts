import { expect, type Locator, type Page } from "@playwright/test";
import BasePage from "./BasePage";
import { safeGoto } from "../helpers/navigation";
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
    // (split into spans on desktop, plain text on mobile). Constrain to
    // level=1 because desktop also renders an h2 SectionHeading with the
    // same text just below the h1.
    this.heading = page
      .getByRole("heading", { level: 1, name: /How did/i })
      .filter({ visible: true });

    // Both desktop (hidden md:block) and mobile (md:hidden) wrappers
    // mount the same input testids - only one is visible per viewport.
    // Filter to the visible one to avoid strict-mode collisions.
    this.nameInput = page
      .getByTestId("recommend-name")
      .filter({ visible: true });
    this.emailInput = page
      .getByTestId("recommend-email")
      .filter({ visible: true });
    this.companyInput = page
      .getByTestId("recommend-company")
      .filter({ visible: true });
    this.companyEmailInput = page
      .getByTestId("recommend-company-email")
      .filter({ visible: true });
    this.phoneInput = page
      .getByTestId("recommend-phone")
      .filter({ visible: true });
    this.commentInput = page
      .getByTestId("recommend-comment")
      .filter({ visible: true });
    // <input type="file"> is intentionally display:none (styled button
    // covers it), so .filter({ visible: true }) won't work. Instead,
    // scope to whichever surface wrapper is visible for this viewport.
    this.fileInput = page
      .getByTestId("recommend-mobile")
      .or(page.getByTestId("main-content"))
      .filter({ visible: true })
      .locator('input[type="file"]');

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
    // Both viewports emit the same testid for field errors, but only one
    // surface is visible at a time. Filter to the visible one.
    return this.page
      .getByTestId(FIELD_ERROR_TESTID[field])
      .filter({ visible: true });
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
    // safeGoto handles the "interrupted by another navigation" race that
    // hits when a post-login redirect is still in flight when we try to
    // navigate here.
    await safeGoto(this.page, `/projects/${projectId}/recommend`);
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
      .filter({ visible: true })
      .first()
      .waitFor({ state: "visible", timeout: 5_000 })
      .catch(() => {});
    // Photo Acceptable Use Policy consent - the FileGridUploader renders
    // a checkbox below the grid once any file is attached, and the submit
    // button is disabled until it's ticked. Both viewports mount the
    // testid, so scope to the visible one.
    await this.page
      .getByTestId("photo-consent-checkbox")
      .filter({ visible: true })
      .check({ timeout: 5_000 });
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

  /**
   * Fill every field a logged-in recommender needs to submit. Handles
   * both viewports (mobile two-step wizard / desktop single page) and
   * asserts the auto-filled identity fields once they're on screen
   * (Step 2 on mobile, immediately on desktop). Leaves the page on the
   * final submit-ready state - call submitForm() separately when ready.
   */
  async fillRecommendationForLoggedInUser(
    account: Account,
    recommendation: Recommendation,
  ) {
    const payload = recommendation.toMultipartPayload();
    const { fields, photos } = payload;

    // Step 1 (mobile) or top of form (desktop): ratings + comment.
    await this.setRatingsFromModel(recommendation);
    await this.commentInput.fill(fields.comment);

    if (this.isMobile()) {
      await this.goToStep2();
    }

    // Identity inputs only render on Step 2 (mobile) - assert them now
    // that we're on the surface that hosts them.
    await this.hasPrefilledIdentity(account);

    // Photos live between tradesperson and recommender sections - attach
    // after step nav so the layout shift settles.
    await this.attachPhotos(photos);

    await this.fillStep2Fields(fields, { fillIdentity: false });
  }

  async submitRecommendationForLoggedInUser(
    account: Account,
    recommendation: Recommendation,
  ) {
    await this.fillRecommendationForLoggedInUser(account, recommendation);
    await this.submitButton.click();
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
      this.page
        .getByText(/Your recommendation for .* has been sent/i)
        .filter({ visible: true }),
    ).toBeVisible({ timeout: 10_000 });
  }
}

export default ProjectRecommendPage;
