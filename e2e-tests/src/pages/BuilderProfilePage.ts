// src/pages/BuilderProfilePage.ts

import { expect, type Locator, type Page } from "@playwright/test";
import Recommendation from "../models/Recommendation";
import BasePage from "./BasePage";
import { safeGoto } from "../helpers/navigation";

export class BuilderProfilePage extends BasePage {
  // Wrappers (one per surface)
  readonly desktopRoot: Locator;
  readonly mobileRoot: Locator;

  // Identity
  readonly companyName: Locator;

  // Desktop-only
  readonly desktopBackButton: Locator;
  readonly contactDetailsCard: Locator;
  readonly phoneSection: Locator;
  readonly reviewsCard: Locator;
  readonly googleRatingChip: Locator;
  readonly sharedPhotosSection: Locator;

  // Mobile-only
  readonly mobileBackButton: Locator;
  readonly mobileFavouriteButton: Locator;

  // Both viewports (same testid)
  readonly endorseButton: Locator;

  constructor(page: Page) {
    super(page);

    this.desktopRoot = page.getByTestId("main-content");
    this.mobileRoot = page.getByTestId("builder-profile-mobile");

    // Desktop renders builder-company; mobile renders builder-name. Each
    // sits in its own surface, so filter to whichever is visible.
    this.companyName = page
      .getByTestId("builder-company")
      .or(page.getByTestId("builder-name"))
      .filter({ visible: true });

    this.desktopBackButton = page.getByRole("button", {
      name: "Back to project",
    });
    this.contactDetailsCard = page.getByTestId("contact-details-card");
    this.phoneSection = page.getByTestId("builder-phone");
    this.reviewsCard = page.getByTestId("builder-reviews-card");
    this.googleRatingChip = page.getByTestId("builder-google-rating");
    this.sharedPhotosSection = page
      .getByTestId("builder-shared-photos-empty")
      .or(page.getByTestId("builder-shared-photos-locked"))
      .or(page.locator('[data-testid="shared-profile-photos-section"]'));

    this.mobileBackButton = page.getByTestId("builder-mobile-back");
    this.mobileFavouriteButton = page.getByTestId("builder-mobile-favourite");

    // Both desktop and mobile render the endorse button with the same
    // testid - filter to the visible surface.
    this.endorseButton = page
      .getByTestId("btn-vote-up")
      .filter({ visible: true });
  }

  isMobile(): boolean {
    const vp = this.page.viewportSize();
    return vp ? vp.width < 768 : false;
  }

  async visit(recommendationId: string | number, options?: { projectId?: string | number }) {
    // ?projectId= is what makes the desktop "Back to project" button render
    // (BuilderHeader only shows it when builder.project.id is set).
    const query = options?.projectId ? `?projectId=${options.projectId}` : "";
    await safeGoto(this.page, `/builders/${recommendationId}${query}`);
    await expect(this.page).toHaveURL(`/builders/${recommendationId}${query}`);
    await this.waitUntilReady();
  }

  /**
   * Visit the builder profile from a project context. Mirrors a real
   * user journey: open the project, then tap a recommendation card.
   * Behind the scenes, the desktop "Back to project" pill is gated on
   * `?projectId=` and the mobile back chevron uses router.back(), so
   * the project page has to exist in browser history first. Both are
   * handled here so the spec stays viewport-agnostic.
   */
  async visitFromProject(
    projectId: string | number,
    recommendationId: string | number,
  ) {
    if (this.isMobile()) {
      await safeGoto(this.page, `/projects/${projectId}`);
    }
    await this.visit(recommendationId, { projectId });
  }

  async waitUntilReady() {
    const isMobile = this.isMobile();
    await expect
      .poll(
        async () => {
          const url = this.page.url();
          if (/\/signin|\/signup/.test(url)) {
            return { ok: false, reason: `redirected:${url}` };
          }
          const wrapper = isMobile ? this.mobileRoot : this.desktopRoot;
          if (!(await wrapper.isVisible().catch(() => false))) {
            return { ok: false, reason: "wrapper not visible" };
          }
          if (!(await this.companyName.isVisible().catch(() => false))) {
            return { ok: false, reason: "company name not visible" };
          }
          return { ok: true, reason: "ok" };
        },
        {
          timeout: 30_000,
          intervals: [200, 300, 500, 800, 1200],
          message: "Builder profile page did not become ready.",
        },
      )
      .toEqual({ ok: true, reason: "ok" });
  }

  async hasBuilderRecommendationDetails(recommendation: Recommendation) {
    await this.waitUntilReady();

    // Allow an optional ?projectId= query string.
    await expect(this.page).toHaveURL(/\/builders\/\d+(\?.*)?$/);
    await expect(this.companyName).toHaveText(
      new RegExp(
        recommendation.company.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
        "i",
      ),
    );

    if (this.isMobile()) {
      // Mobile inlines contact info differently and doesn't expose the
      // contact-details-card / builder-phone testids.
      return;
    }

    await expect(this.contactDetailsCard).toBeVisible();
    await expect(this.phoneSection).toContainText(recommendation.phone!);

    if (recommendation.comment) {
      await expect(this.reviewsCard).toBeVisible();
      await expect(this.reviewsCard).toContainText(recommendation.comment);
    }
  }

  /**
   * Navigate back to the project. On desktop this clicks the "Back to
   * project" pill; on mobile it taps the chevron, which fires
   * router.back() so the test must have been on /projects/{id} first.
   */
  async goBackToProject(projectId?: string | number) {
    if (this.isMobile()) {
      await expect(this.mobileBackButton).toBeVisible();
      await this.mobileBackButton.click();
    } else {
      await expect(this.desktopBackButton).toBeVisible();
      await this.desktopBackButton.click();
    }
    if (projectId !== undefined) {
      await expect(this.page).toHaveURL(
        new RegExp(`/projects/${projectId}(\\?.*)?$`),
      );
    } else {
      await expect(this.page).toHaveURL(/\/projects\/\d+/);
    }
  }

  async endorseBuilder() {
    await expect(this.endorseButton).toBeVisible();
    await expect(this.endorseButton).toBeEnabled();
    await this.endorseButton.click();
  }

  async hasEndorsed() {
    // Button text flips from "Endorse" to "Endorsed" and aria-pressed
    // becomes "true" once the like is recorded.
    await expect(this.endorseButton).toHaveText(/^Endorsed$/i, {
      timeout: 10_000,
    });
    await expect(this.endorseButton).toHaveAttribute("aria-pressed", "true");
  }

  async expectEndorseDisabled() {
    await expect(this.endorseButton).toBeDisabled();
  }

  async clickReport() {
    const btn = this.page
      .getByTestId("btn-report-profile")
      .filter({ visible: true });
    await expect(btn).toBeVisible({ timeout: 10_000 });
    await btn.click();
  }

  async toggleMobileFavourite() {
    await expect(this.mobileFavouriteButton).toBeVisible();
    await this.mobileFavouriteButton.click();
  }

  async expectMobileFavouritePressed(pressed: boolean) {
    await expect(this.mobileFavouriteButton).toHaveAttribute(
      "aria-pressed",
      String(pressed),
      { timeout: 10_000 },
    );
  }
}

export default BuilderProfilePage;
