// src/pages/BuilderProfilePage.ts

import { expect, type Locator, type Page } from "@playwright/test";
import Recommendation from "../models/Recommendation";
import BasePage from "./BasePage";

export class BuilderProfilePage extends BasePage {
  readonly root: Locator;
  readonly companyName: Locator;
  readonly contactDetailsCard: Locator;
  readonly phoneSection: Locator;
  readonly reviewsCard: Locator;
  readonly sharedPhotosSection: Locator;
  readonly voteUpButton: Locator;
  readonly backToProjectLink: Locator;
  readonly googleRatingChip: Locator;

  constructor(page: Page) {
    super(page);

    this.root = page.getByTestId("main-content");
    this.companyName = page.getByTestId("builder-company");
    this.contactDetailsCard = page.getByTestId("contact-details-card");
    this.phoneSection = page.getByTestId("builder-phone");
    this.reviewsCard = page.getByTestId("builder-reviews-card");
    this.sharedPhotosSection = page
      .getByTestId("builder-shared-photos-empty")
      .or(page.getByTestId("builder-shared-photos-locked"))
      .or(page.locator('[data-testid="shared-profile-photos-section"]'));
    this.voteUpButton = page.getByTestId("btn-vote-up");
    this.backToProjectLink = page.getByRole("button", {
      name: "Back to project",
    });
    this.googleRatingChip = page.getByTestId("builder-google-rating");
  }

  async visit(recommendationId: string | number) {
    await this.page.goto(`/builders/${recommendationId}`, {
      waitUntil: "domcontentloaded",
    });
    await expect(this.page).toHaveURL(`/builders/${recommendationId}`);
    await this.waitUntilReady();
  }

  async waitUntilReady() {
    await expect
      .poll(
        async () => {
          const url = this.page.url();

          if (/\/signin|\/signup/.test(url)) {
            return { ok: false, reason: `redirected:${url}` };
          }

          const rootVisible = await this.root.isVisible().catch(() => false);
          if (!rootVisible) {
            return { ok: false, reason: "main-content not visible" };
          }

          const companyVisible = await this.companyName
            .isVisible()
            .catch(() => false);
          if (!companyVisible) {
            return { ok: false, reason: "builder company not visible" };
          }

          const contactVisible = await this.contactDetailsCard
            .isVisible()
            .catch(() => false);
          if (!contactVisible) {
            return { ok: false, reason: "contact details card not visible" };
          }

          return { ok: true, reason: "ok" };
        },
        {
          timeout: 45_000,
          intervals: [200, 300, 500, 800, 1200],
          message: "Builder profile page did not become ready.",
        },
      )
      .toEqual({ ok: true, reason: "ok" });
  }

  async hasBuilderRecommendationDetails(recommendation: Recommendation) {
    await this.waitUntilReady();

    // Allow an optional ?projectId= query string — the project view forwards
    // it so the builder profile page can render the Hire button.
    await expect(this.page).toHaveURL(/\/builders\/\d+(\?.*)?$/);
    await expect(this.companyName).toHaveText(
      new RegExp(recommendation.company.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"),
    );
    await expect(this.contactDetailsCard).toBeVisible();
    await expect(this.phoneSection).toContainText(recommendation.phone!);

    if (recommendation.comment) {
      await expect(this.reviewsCard).toBeVisible();
      await expect(this.reviewsCard).toContainText(recommendation.comment);
    }
  }

  async goBackToProject() {
    await expect(this.backToProjectLink).toBeVisible();
    await this.backToProjectLink.click();
    await expect(this.page).toHaveURL(/\/projects\/\d+$/);
  }

  async voteUp() {
    await expect(this.voteUpButton).toBeVisible();
    await expect(this.voteUpButton).toBeEnabled();
    await this.voteUpButton.click();
  }

  async hasVotedUp() {
    // Source uses curly apostrophe U+2019 — match with \u2019 to be explicit
    await expect(this.voteUpButton).toHaveText(/you\u2019ve voted/i, {
      timeout: 10_000,
    });
  }
}

export default BuilderProfilePage;
