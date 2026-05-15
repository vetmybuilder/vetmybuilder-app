import { expect, type Locator, type Page } from "@playwright/test";
import BasePage from "./BasePage";
import Tradesman from "../models/tradesman";
import { hrefMatcher } from "../utils/formatters";
import { safeGoto } from "../helpers/navigation";

export class TradesmanPublicProfilePage extends BasePage {
  readonly root: Locator;
  readonly name: Locator;
  readonly memberSince: Locator;
  readonly contactCard: Locator;
  readonly reviewLinksSection: Locator;
  readonly avatarPhoto: Locator;
  readonly avatarInitials: Locator;
  readonly extrasSection: Locator;

  constructor(page: Page) {
    super(page);
    this.root = page
      .getByTestId("tradesman-page")
      .or(page.getByTestId("tradesman-profile-mobile"))
      .filter({ visible: true });
    this.name = page.getByTestId("tradesman-name").filter({ visible: true });
    this.memberSince = page
      .getByText(/\bMember since [A-Z][a-z]+ \d{4}\b/)
      .filter({ visible: true })
      .first();
    this.contactCard = page
      .getByTestId("tradesman-contact-card")
      .filter({ visible: true });
    this.reviewLinksSection = page
      .getByTestId("tradesman-review-links-section")
      .filter({ visible: true });
    this.avatarPhoto = page
      .getByTestId("tradesman-avatar-photo")
      .filter({ visible: true });
    this.avatarInitials = page
      .getByTestId("tradesman-avatar-initials")
      .filter({ visible: true });
    this.extrasSection = page
      .getByTestId("tradesman-extras")
      .filter({ visible: true })
      .first();
  }

  async visit(uid: string) {
    // The previous step (TradesmanEditPage.save) ends with a router.replace
    // to /tradesman/account; webkit can fire that navigation just as we
    // call goto(). safeGoto retries past the "interrupted by another
    // navigation" error so we land on the public profile cleanly.
    await safeGoto(this.page, `/tradesman/${uid}`);
    await expect(this.root).toBeVisible();
  }

  async expectAvatarSrc(url: string): Promise<void> {
    await expect(this.avatarPhoto).toBeVisible({ timeout: 10_000 });
    await expect(this.avatarPhoto).toHaveAttribute("src", url);
  }

  async clickReport() {
    const btn = this.page
      .getByTestId("btn-report-profile")
      .filter({ visible: true });
    await expect(btn).toBeVisible({ timeout: 10_000 });
    await btn.click();
  }

  /**
   * One-shot assertion that the public profile renders everything the
   * given Tradesman model represents - and nothing extra. Reads straight
   * from the model so specs stay declarative:
   *
   *   await tradesmanPublicProfilePage.hasProfile(builder.tradesman);
   *
   * Use the same call to verify edits: build the expected post-edit
   * Tradesman, save the form, then assert the public profile matches it.
   *
   * Derivation:
   *   companyName     - always asserted
   *   memberSince     - always asserted
   *   profile photo   - asserted when photoUrls / profilePictureUrl set,
   *                     initials asserted otherwise
   *   phone/website   - asserted (href value) when set on the model
   *   contactCard     - asserted when phone/email/website present
   *   trades          - chips match the model's tradeTypes CSV exactly
   *                     (count + presence) when set
   *   service areas   - chips match the model's serviceAreas CSV exactly
   *                     (count + presence) when set
   *   warranty        - "Warranty: N months" asserted when warrantyMonths set
   *   discount        - "Offers discounts" asserted when offersDiscount true
   *   review links    - each entry asserted with href + platform name +
   *                     security attributes; section absence asserted
   *                     when the model has none
   */
  async hasProfile(tradesman: Tradesman): Promise<void> {
    await expect(this.root).toBeVisible();
    await expect(this.name).toContainText(tradesman.companyName);
    await expect(this.memberSince).toBeVisible();

    if (this.tradesmanHasContactInfo(tradesman)) {
      await expect(this.contactCard).toBeVisible();
    }

    // Phone + email are intentionally NOT exposed on the public profile
    // (2026-05 security hardening: contact info only reveals after a
    // mutual swipe or paid unlock, not on `/tradesmen/:publicId`).
    // We assert the website link below because the web URL is supposed
    // to be public marketing info.

    if (tradesman.website) {
      const websiteLink = this.page
        .getByTestId("tradesman-website")
        .filter({ visible: true });
      await expect(websiteLink).toBeVisible();
      await expect(websiteLink).toHaveAttribute(
        "href",
        hrefMatcher(tradesman.website),
      );
    }

    if (this.tradesmanHasPhoto(tradesman)) {
      await expect(this.avatarPhoto).toBeVisible({ timeout: 10_000 });
      await expect(this.avatarInitials).toHaveCount(0);
    } else {
      await expect(this.avatarInitials).toBeVisible({ timeout: 10_000 });
      await expect(this.avatarPhoto).toHaveCount(0);
    }

    // No Tradesman seeded by these specs has Google Place data, so the
    // Google rating chip should never render. Asserting absence here
    // catches regressions where the chip leaks in without backing data.
    await expect(this.page.getByTestId("builder-google-rating")).toHaveCount(
      0,
    );

    const trades = this.tradesAsList(tradesman);
    if (trades.length > 0) {
      const tradeChips = this.page
        .getByTestId("tradesman-trade-item")
        .filter({ visible: true });
      await expect(tradeChips).toHaveCount(trades.length);
      for (const trade of trades) {
        await expect(
          tradeChips.filter({ hasText: new RegExp(trade, "i") }).first(),
        ).toBeVisible();
      }
    }

    const areas = this.serviceAreasAsList(tradesman);
    if (areas.length > 0) {
      for (const area of areas) {
        // Service-area chips are rendered in both mobile and desktop trees;
        // filter to whichever is currently visible.
        await expect(
          this.page
            .getByTestId(`tradesman-service-area-${area}`)
            .filter({ visible: true }),
        ).toBeVisible();
      }
    }

    if (typeof tradesman.warrantyMonths === "number") {
      await expect(this.extrasSection).toContainText(
        new RegExp(`Warranty:?\\s*${tradesman.warrantyMonths}\\s*months`, "i"),
      );
    }

    if (tradesman.offersDiscount) {
      await expect(this.extrasSection).toContainText(/offers discounts/i);
    }

    const reviewLinks = tradesman.reviewLinks ?? [];
    if (reviewLinks.length === 0) {
      await expect(
        this.page.getByTestId("tradesman-review-links-section"),
      ).toHaveCount(0);
    } else {
      await expect(this.reviewLinksSection).toBeVisible({ timeout: 15_000 });
      for (const entry of reviewLinks) {
        await this.expectReviewLink(entry);
      }
    }
  }

  private tradesmanHasContactInfo(tradesman: Tradesman): boolean {
    return Boolean(tradesman.phone || tradesman.email || tradesman.website);
  }

  private tradesmanHasPhoto(tradesman: Tradesman): boolean {
    return Boolean(
      tradesman.profilePictureUrl ||
        (tradesman.photoUrls && tradesman.photoUrls.length > 0),
    );
  }

  private tradesAsList(tradesman: Tradesman): string[] {
    if (!tradesman.tradeTypes) return [];
    return tradesman.tradeTypes
      .split(/[,;]/)
      .map((t) => t.trim())
      .filter(Boolean);
  }

  private serviceAreasAsList(tradesman: Tradesman): string[] {
    if (!tradesman.serviceAreas) return [];
    return tradesman.serviceAreas
      .split(/[,;]/)
      .map((a) => a.trim())
      .filter(Boolean);
  }

  private async expectReviewLink(entry: {
    platform: string;
    url: string;
  }): Promise<void> {
    const link = this.page
      .getByTestId(`tradesman-review-link-${entry.platform}`)
      .filter({ visible: true })
      .getByRole("link");
    await expect(link).toBeVisible({ timeout: 15_000 });
    await expect(link).toHaveAttribute("href", entry.url);
    await expect(link).toContainText(new RegExp(entry.platform, "i"));
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", /nofollow/);
  }
}

export default TradesmanPublicProfilePage;
