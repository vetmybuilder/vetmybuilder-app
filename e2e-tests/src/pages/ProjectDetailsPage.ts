import { expect, type Locator, type Page } from "@playwright/test";
import { safeGoto } from "../helpers/navigation";
import Project from "../models/Project";
import Recommendation from "../models/Recommendation";
import { type PublishOptions } from "./components/PublishModalComponent";
import CloseProjectModalComponent, {
  type CloseProjectOptions,
} from "./components/CloseProjectModalComponent";
import BasePage from "./BasePage";
import dayjs from "dayjs";

export type ProjectStatus = "Pending" | "Live" | "Completed" | "Archived";

type DateChecks = {
  createdAt?: Date | string;
  updatedAt?: Date | string;
};

export class ProjectDetailsPage extends BasePage {
  readonly root: Locator;

  readonly title: Locator;
  readonly backLink: Locator;

  readonly shareAndPublish: Locator;
  readonly shareButton: Locator;
  readonly viewMoreButton: Locator;
  readonly shortlistEmptyCta: Locator;
  readonly closeThisJobButton: Locator;
  readonly editProjectButton: Locator;

  readonly topRecommendationsSection: Locator;
  readonly spotlightSection: Locator;
  readonly projectInsightsCard: Locator;

  readonly notificationsButton: Locator;
  readonly projectBadges: Locator;
  readonly recommendTradespersonButton: Locator;
  readonly projectDetailsHeading: Locator;
  readonly shortlistCompanyName: Locator;
  readonly shortlistComment: Locator;
  readonly shortlistCompaniesHouseBadge: Locator;
  readonly shortlistCompaniesHouseBadgeText: Locator;
  readonly shortlistPhotosBadge: Locator;
  readonly shortlistRecommender: Locator;

  readonly unarchiveButton: Locator;

  readonly sharedTradesmenStrip: Locator;

  private readonly headerMetaDate: Locator;
  private readonly closeProjectModal: CloseProjectModalComponent;

  constructor(page: Page) {
    super(page);

    this.root = page.getByTestId("main-content");
    this.title = this.root.getByRole("heading").first();

    this.backLink = page
      .getByTestId("btn-back")
      .or(page.getByRole("link", { name: "Back to project" }))
      .or(page.getByRole("link", { name: "Back" }))
      .or(page.getByRole("link", { name: /←\s*back/i }));

    this.headerMetaDate = this.root.locator("span.text-slate-400");

    this.shareAndPublish = this.root.getByTestId("btn-get-recs-draft");
    this.shareButton = this.root.getByTestId("btn-get-recs");
    this.viewMoreButton = this.root.getByTestId("btn-shortlist-view-more");
    this.shortlistEmptyCta = this.root.getByTestId("btn-shortlist-share-publish");
    this.closeThisJobButton = this.root.getByTestId("btn-close-project");
    this.editProjectButton = this.root.getByTestId("btn-edit");

    this.projectDetailsHeading = page.getByRole("heading", {
      name: "Project details",
    });

    this.projectBadges = page.getByTestId("project-badges-inline");

    this.recommendTradespersonButton = page.getByTestId(
      "btn-neighbour-recommend",
    );
    this.topRecommendationsSection = page.getByTestId("project-shortlist");
    this.spotlightSection = page.getByTestId("spotlight-strip");
    this.projectInsightsCard = page.getByTestId("project-insights-card");

    this.notificationsButton = page.locator(
      'button[aria-label="Notifications (unread)"]:visible',
    );
    this.shortlistCompanyName = page.getByTestId("shortlist-company-name");
    this.shortlistComment = page.getByTestId("shortlist-comment");
    this.shortlistCompaniesHouseBadge = page.getByTestId("shortlist-badge-ch");
    this.shortlistCompaniesHouseBadgeText = page.getByTestId(
      "shortlist-badge-ch-text",
    );
    this.shortlistPhotosBadge = page.getByTestId("shortlist-badge-photos");
    this.shortlistRecommender = page.getByTestId("shortlist-recommender");

    this.unarchiveButton = this.root.getByTestId("btn-unarchive");

    this.sharedTradesmenStrip = page.getByTestId("shared-tradesmen-strip");

    this.closeProjectModal = new CloseProjectModalComponent(page);
  }

  private toDate(v: Date | string) {
    return v instanceof Date ? v : new Date(v);
  }

  private formatUiDate(d: Date) {
    return d.toLocaleDateString("en-GB");
  }

  async waitUntilReady() {
    // project-view-page only renders once the project data + auth role are
    // resolved (ready = true in [id].tsx). Gate on it first so we are not
    // polling for inner controls while React is still loading.
    const projectViewPage = this.page.getByTestId("project-view-page");

    await expect
      .poll(
        async () => {
          const url = this.page.url();

          if (/\/signin|\/signup/.test(url)) {
            return { ok: false, reason: `redirected:${url}` };
          }

          const pageReady = await projectViewPage
            .isVisible()
            .catch(() => false);
          if (!pageReady) {
            return { ok: false, reason: "project-view-page not ready" };
          }

          const titleVisible = await this.title.isVisible().catch(() => false);
          if (titleVisible) return { ok: true, reason: "ok" };

          const editVisible = await this.editProjectButton
            .isVisible()
            .catch(() => false);
          if (editVisible) return { ok: true, reason: "ok" };

          const closeVisible = await this.closeThisJobButton
            .isVisible()
            .catch(() => false);
          if (closeVisible) return { ok: true, reason: "ok" };

          const shareVisible =
            (await this.shareAndPublish.isVisible().catch(() => false)) ||
            (await this.shareButton.isVisible().catch(() => false));
          if (shareVisible) return { ok: true, reason: "ok" };

          const statusVisible = await this.page
            .getByRole("status")
            .first()
            .isVisible()
            .catch(() => false);
          if (statusVisible) return { ok: true, reason: "ok" };

          // Neighbour view: recommend button is the visible control
          const recommendVisible = await this.recommendTradespersonButton
            .isVisible()
            .catch(() => false);
          if (recommendVisible) return { ok: true, reason: "ok" };

          return { ok: false, reason: "waiting for details controls" };
        },
        {
          timeout: 30_000,
          intervals: [200, 300, 500, 1000],
          message:
            "Project details page did not become ready (project-view-page rendered but details controls never appeared).",
        },
      )
      .toEqual({ ok: true, reason: "ok" });
  }

  async assertCreatedOrUpdatedDate(dates: DateChecks) {
    if (!dates.createdAt && !dates.updatedAt) return;

    await expect(this.headerMetaDate).toBeVisible();

    if (dates.updatedAt) {
      const d = this.toDate(dates.updatedAt);
      await expect(this.headerMetaDate).toHaveText(
        `Updated ${this.formatUiDate(d)}`,
      );
      return;
    }

    if (dates.createdAt) {
      const d = this.toDate(dates.createdAt);
      await expect(this.headerMetaDate).toHaveText(
        `Created ${this.formatUiDate(d)}`,
      );
    }
  }

  async assertUpdatedToday() {
    await expect(this.headerMetaDate).toBeVisible();

    const today = await this.page.evaluate(() =>
      new Date().toLocaleDateString("en-GB"),
    );

    await expect(this.headerMetaDate).toHaveText(`Updated ${today}`);
  }

  async visit(projectId: string | number) {
    await safeGoto(this.page, `/projects/${projectId}`);
    await expect(this.page).toHaveURL(
      new RegExp(`/projects/${projectId}(\\?.*)?$`),
    );
    await this.waitUntilReady();
  }

  async editProject(_projectId?: string | number) {
    // await expect(this.editProjectButton).toBeVisible();
    await this.editProjectButton.click();
  }

  async goBack() {
    const vp = this.page.viewportSize();
    if (vp && vp.width < 640) {
      // Back link is hidden on mobile — navigate directly
      await this.page.goto("/projects");
    } else {
      await expect(this.backLink).toBeVisible();
      await this.backLink.click();
    }
    await expect(this.page).toHaveURL(/\/projects$/);
  }

  async hasStatus(status: ProjectStatus) {
    const map: Record<ProjectStatus, RegExp> = {
      Pending: /pending/i,
      Live: /live|published/i,
      Completed: /completed/i,
      Archived: /archived/i,
    };

    await expect(this.root.getByRole("status")).toHaveText(map[status], {
      timeout: 15_000,
    });
  }

  async hasNotification(text: string) {
    await expect(this.notificationsButton).toBeVisible({ timeout: 15_000 });
    await this.notificationsButton.click({delay: 1000});

    // Notifications are now grouped by project. Try finding the text directly first
    // (ungrouped or already expanded). If not found, expand all group headers then retry.
    const directMatch = this.page.getByText(text).first();
    const visible = await directMatch.isVisible().catch(() => false);
    if (!visible) {
      // Click all collapsed group headers (▼ buttons) to expand them
      const groupHeaders = this.page.locator('[aria-label="Notifications"] button:has-text("▼")');
      const count = await groupHeaders.count();
      for (let i = 0; i < count; i++) {
        await groupHeaders.nth(i).click();
      }
    }

    await expect(
      this.page.getByText(text).first(),
    ).toBeVisible({ timeout: 25_000 });
  }

  async openNotification(text: string) {
    // Expand groups if needed, then click the notification
    const directMatch = this.page.getByText(text).first();
    const visible = await directMatch.isVisible().catch(() => false);
    if (!visible) {
      const groupHeaders = this.page.locator('[aria-label="Notifications"] button:has-text("▼")');
      const count = await groupHeaders.count();
      for (let i = 0; i < count; i++) {
        await groupHeaders.nth(i).click();
      }
    }

    const notification = this.page.getByText(text).first();
    await expect(notification).toBeVisible();
    await notification.click();
  }

  async hasProjectDetails(
    projectId: string | number,
    project: Project,
    opts?: { status?: ProjectStatus; dates?: DateChecks },
  ) {
    const input = project.toCreateInput();

    await expect(this.page).toHaveURL(
      (url) => url.pathname === `/projects/${projectId}`,
    );
    await this.waitUntilReady();
    // Back link is hidden on mobile (hidden sm:inline-flex)
    const vp = this.page.viewportSize();
    if (!vp || vp.width >= 640) {
      await expect(this.backLink).toBeVisible();
    }
    await expect(this.closeThisJobButton).toBeVisible();

    if (opts?.dates) {
      await this.assertCreatedOrUpdatedDate(opts.dates);
    }

    if (opts?.status) {
      await this.hasStatus(opts.status);
    }

    await expect(this.root).toContainText(input.workTypes[0]);
    await expect(this.root).toContainText(input.propertyType);
    await expect(this.root).toContainText(`${input.bedrooms} bed`);
    await expect(this.root).toContainText(input.locationPick.split(" ")[0]);
  }

  async hasTopRecommendations(expected: boolean) {
    await expect(this.topRecommendationsSection).toBeVisible();

    if (!expected) {
      await expect(this.topRecommendationsSection).toContainText(
        "No builders have yet been recommended by a friend or neighbours.",
      );

      return;
    }

    await expect(this.topRecommendationsSection).not.toContainText(
      "No builders have yet been recommended by a friend or neighbours.",
    );
  }

  async hasSpotlight(expected: boolean) {
    await expect(this.spotlightSection).toBeVisible();

    if (!expected) {
      await expect(this.spotlightSection).toContainText(
        "No spotlight tradesmen are available for this project yet.",
      );
      return;
    }

    await expect(this.spotlightSection).not.toContainText(
      "No spotlight tradesmen are available for this project yet.",
    );
  }

  /**
   * Asserts the "Typical cost range" badge renders. Pass `expected` to also
   * verify the exact min/max (useful when editing should change the range).
   *
   * The badge sits inside the Project Insights card, which only appears
   * after the async classifier finishes — allow a generous timeout so
   * the test isn't flaky in CI.
   */
  async hasPriceRangeBadge(expected?: { min: number; max: number }) {
    const badge = this.page.getByTestId("price-range-badge");
    await expect(badge).toBeVisible({ timeout: 15_000 });
    await expect(badge).toContainText("Typical cost range");
    await expect(badge).toContainText(/ballpark, not a quote/i);

    const value = this.page.getByTestId("price-range-value");
    if (expected) {
      const format = (n: number) => `£${n.toLocaleString("en-GB")}`;
      await expect(value).toHaveText(
        `${format(expected.min)}–${format(expected.max)}`,
      );
    } else {
      await expect(value).toContainText(/£\d[\d,]*–£\d[\d,]*/);
    }
  }

  /**
   * Asserts the Project Insights card does NOT contain a price-range badge.
   * Used by tests that create a project with no spec match and no AI
   * classification (so neither badge source is available).
   */
  async hasNoPriceRangeBadge() {
    await expect(this.page.getByTestId("price-range-badge")).toHaveCount(0);
  }

  /**
   * Asserts the deterministic price-range is NOT shown. The badge itself
   * may still be visible with the AI-fallback caveat — we don't care —
   * but it must NOT claim to be "Based on your job details" (the
   * deterministic source caveat).
   *
   * Use this when verifying that editing a project's work type to a
   * non-spec type stops the spec-driven range, without racing against
   * the fire-and-forget AI classifier re-running on the updated project.
   */
  async hasNoDeterministicPriceRangeBadge() {
    const badge = this.page.getByTestId("price-range-badge");
    if ((await badge.count()) === 0) return;
    await expect(badge).not.toContainText("Based on your job details");
  }

  async publish(options?: PublishOptions) {
    await expect(this.shareAndPublish).toBeVisible();
    await this.shareAndPublish.click();
    await this.assertPublishModalVisible();
    await this.publishModal.publish(options);
    await this.assertPublishModalHidden();
  }

  async closeProject(options?: CloseProjectOptions) {
    await expect(this.closeThisJobButton).toBeVisible();
    await this.closeThisJobButton.click();
    await this.closeProjectModal.closeProject(options);
  }

  async unarchive() {
    await expect(this.unarchiveButton).toBeVisible();
    await this.unarchiveButton.click();
    await this.hasStatus("Pending");
  }

  async hasHomeownerProjectDetails(
    projectId: string | number,
    project: Project,
  ) {
    const input = project.toCreateInput();
    const location = input.locationPick.split(" ")[0];

    await expect(this.page).toHaveURL(`/projects/${projectId}`, { timeout: 20_000 });
    await this.waitUntilReady();

    // The neighbour view uses the project type as the hero heading (not "Project details")
    const heroHeading = this.page.getByRole("heading", { name: input.workTypes[0] });
    const detailsHeading = this.projectDetailsHeading;
    await expect(heroHeading.or(detailsHeading).first()).toBeVisible({ timeout: 15_000 });

    await expect(this.projectBadges).toContainText(input.workTypes[0]);
    await expect(this.projectBadges).toContainText(location);
    await expect(this.projectBadges).toContainText(input.propertyType);
    await expect(this.projectBadges).toContainText(`${input.bedrooms} bed`);
    await expect(
      this.projectBadges.getByRole("status", { name: "Status: Live" }),
    ).toBeVisible();

    await expect(this.recommendTradespersonButton).toBeVisible();
  }

  async hasProjectRecommendation(recommendation: Recommendation) {
    const companyRegex = new RegExp(
      recommendation.company.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
      "i",
    );

    const card = this.page
      .getByTestId("shortlist-group")
      .filter({ has: this.page.getByTestId("shortlist-company-name").filter({ hasText: companyRegex }) })
      .first();

    await expect(card).toBeVisible({ timeout: 15_000 });
    await expect(card.getByTestId("shortlist-comment")).toContainText(recommendation.comment);
    await expect(card.getByTestId("shortlist-badge-ch")).toBeVisible();
    await expect(card.getByTestId("shortlist-badge-photos")).toBeVisible();
    await expect(card.getByTestId("shortlist-recommender")).toHaveText(
      `Community recommendation made on ${dayjs().format("M/D/YYYY")}`,
    );
  }

  async openProjectRecommendation(recommendation: Recommendation) {
    const recommendationCard = this.shortlistCompanyName
      .filter({
        hasText: new RegExp(recommendation.company, "i"),
      })
      .first();

    await expect(recommendationCard).toBeVisible();
    await recommendationCard.scrollIntoViewIfNeeded();
    await recommendationCard.click();
  }

  async openShareModal(): Promise<void> {
    await expect(this.shareButton).toBeVisible();
    await this.shareButton.click();
    await this.assertPublishModalVisible();
  }

  async clickShortlistShareCta(): Promise<void> {
    await expect(this.shareAndPublish).toBeVisible();
    await this.shareAndPublish.click();
    await this.assertPublishModalVisible();
  }

  async goToShortlist(projectId: string | number): Promise<void> {
    // Recommendations load asynchronously after the page is ready, so give
    // the "View more" button extra time to appear on slower mobile browsers.
    await expect(this.viewMoreButton).toBeVisible({ timeout: 45_000 });
    await this.viewMoreButton.click();
    await expect(this.page).toHaveURL(`/projects/${projectId}/shortlist`, {
      timeout: 15_000,
    });
  }

  async hasSharedTradesmenStrip(): Promise<void> {
    await expect(this.sharedTradesmenStrip).toBeVisible({ timeout: 20_000 });
  }

  async sharedTradesmanHasPhoto(): Promise<void> {
    await expect(
      this.sharedTradesmenStrip.getByTestId("shared-tradesman-avatar-photo"),
    ).toBeVisible({ timeout: 15_000 });
  }

  async sharedTradesmanHasInitials(initials: string): Promise<void> {
    const badge = this.sharedTradesmenStrip.getByTestId(
      "shared-tradesman-avatar-initials",
    );
    await expect(badge).toBeVisible({ timeout: 15_000 });
    await expect(badge).toHaveText(initials);
  }

  async clickSharedTradesmanCard(): Promise<void> {
    await expect(
      this.sharedTradesmenStrip.getByTestId("shared-tradesman-card").first(),
    ).toBeVisible({ timeout: 15_000 });
    await this.sharedTradesmenStrip
      .getByTestId("shared-tradesman-card")
      .first()
      .click();
  }

  async expectInsightsVisible(): Promise<void> {
    // Classification is fire-and-forget after publish - may need a reload
    await expect
      .poll(
        async () => {
          const visible = await this.projectInsightsCard.isVisible().catch(() => false);
          if (visible) return true;
          await this.page.reload({ waitUntil: "domcontentloaded" });
          await this.page.waitForTimeout(1500);
          return this.projectInsightsCard.isVisible().catch(() => false);
        },
        { timeout: 30_000, intervals: [3000] },
      )
      .toBe(true);
  }

  async expectInsightsNotVisible(): Promise<void> {
    await expect(this.projectInsightsCard).not.toBeVisible({ timeout: 5_000 });
  }

  async expectInsightsContains(text: string): Promise<void> {
    await expect(this.projectInsightsCard).toContainText(text, { timeout: 10_000 });
  }
}

export default ProjectDetailsPage;
