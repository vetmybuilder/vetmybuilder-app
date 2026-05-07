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
  readonly markCompletedButton: Locator;

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

  readonly sharedTradesmenStrip: Locator;

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

    this.shareAndPublish = this.root.getByTestId("btn-get-recs-draft");
    this.shareButton = this.root.getByTestId("btn-get-recs");
    this.viewMoreButton = this.root.getByTestId("btn-shortlist-view-more");
    this.shortlistEmptyCta = this.root.getByTestId("btn-shortlist-share-publish");
    this.markCompletedButton = page
      .getByTestId("btn-mark-completed")
      .filter({ visible: true });

    this.projectDetailsHeading = page.getByRole("heading", {
      name: "Project details",
    });

    this.projectBadges = page.getByTestId("project-badges-inline");

    this.recommendTradespersonButton = page.getByTestId(
      "btn-neighbour-recommend",
    );
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

    this.sharedTradesmenStrip = page.getByTestId("shared-tradesmen-strip");

    this.closeProjectModal = new CloseProjectModalComponent(page);
  }

  async waitUntilReady() {
    await expect(
      this.page
        .getByTestId("project-view-page")
        .filter({ visible: true })
        .first(),
    ).toBeVisible({ timeout: 30_000 });
  }

  async visit(projectId: string | number) {
    await safeGoto(this.page, `/projects/${projectId}`);
    await this.waitUntilReady();
  }

  /**
   * Open the edit-job page from the owner-live project view.
   *   - Desktop: clicks the "Edit job details" link on the LIVE JOB card.
   *   - Mobile: opens the kebab → ProjectActionsSheet → "Edit project".
   */
  async editJob(projectId?: string | number) {
    if (this.isMobile()) {
      const kebab = this.page.getByRole("button", {
        name: "More project actions",
      });
      await expect(kebab).toBeVisible();
      await kebab.click();
      await this.page.getByTestId("project-actions-edit").click();
    } else {
      await this.page
        .getByRole("link", { name: /Edit job details/i })
        .filter({ visible: true })
        .click();
    }
    if (projectId !== undefined) {
      await expect(this.page).toHaveURL(
        new RegExp(`/projects/${projectId}/edit$`),
      );
    } else {
      await expect(this.page).toHaveURL(/\/projects\/\d+\/edit$/);
    }
  }

  /**
   * Asserts that the LIVE JOB card on the owner-live view shows the
   * job's metadata. The card displays project.name (which embeds the
   * work type, location, and property type) plus location + type
   * directly. Replaces the legacy hasProjectDetails which targeted
   * the now-deprecated OwnerProjectView.
   */
  async assertJobMetadataVisible(project: Project) {
    await this.waitUntilReady();
    const input = project.toCreateInput();
    const card = this.page
      .getByTestId("project-view-page")
      .filter({ visible: true });
    // workType is the most consistent signal across viewports - it
    // appears in the title on both desktop (LIVE JOB card) and mobile
    // (ProjectSwipeMobile header). Location/property type only render
    // on desktop; mobile is more compact.
    await expect(card).toContainText(input.workTypes[0]);
  }

  /**
   * Confirms the freshly-created project is in the auto-published Live
   * state (no Draft step). Anti-regression for `projects.post.js` which
   * inserts with `status='live'` so there's never a "publish" CTA: the
   * legacy `btn-get-recs-draft` testid must NOT mount anywhere on the
   * owner page.
   */
  async assertAutoPublishedLiveState() {
    await this.waitUntilReady();
    await expect(this.page.getByTestId("btn-get-recs-draft")).toHaveCount(0);
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
    // 1. Open the bell
    await expect(this.notificationsButton).toBeVisible({ timeout: 15_000 });
    await this.notificationsButton.click();

    // 2. Wait for the panel to appear and data to load
    const panel = this.page.locator('[aria-label="Notifications"]');
    await expect(panel).toBeVisible({ timeout: 10_000 });

    // 3. Expand every collapsed group so item text enters the DOM
    await this.expandAllNotificationGroups(panel);

    // 4. Assert the notification text is visible
    await expect(this.page.getByText(text).first()).toBeVisible({ timeout: 15_000 });
  }

  async openNotification(text: string) {
    // Panel should already be open from hasNotification
    const panel = this.page.locator('[aria-label="Notifications"]');
    await this.expandAllNotificationGroups(panel);

    const notification = this.page.getByText(text).first();
    await expect(notification).toBeVisible({ timeout: 10_000 });
    await notification.click();
  }

  private async expandAllNotificationGroups(panel: Locator) {
    // Wait for at least one group or ungrouped item to load
    await panel.locator('.border-b').first().waitFor({ state: "attached", timeout: 15_000 });

    // Click each collapsed group header (contains the project name)
    const groupButtons = panel.locator('button[type="button"]');
    const count = await groupButtons.count();
    for (let i = 0; i < count; i++) {
      await groupButtons.nth(i).click();
      await this.page.waitForTimeout(500);
    }
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
    // Mobile owner-live (ProjectSwipeMobile) intentionally omits the
    // price-range badge for a streamlined layout. Skip the assertion
    // there - the deterministic pricing is still validated by the
    // server-side hasAnswers check.
    if (this.isMobile()) return;

    const badge = this.page
      .getByTestId("price-range-badge")
      .filter({ visible: true });
    await expect(badge).toBeVisible({ timeout: 15_000 });
    await expect(badge).toContainText("Typical cost range");
    await expect(badge).toContainText(/ballpark, not a quote/i);

    const value = this.page
      .getByTestId("price-range-value")
      .filter({ visible: true });
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
    if (this.isMobile()) return;
    const badge = this.page
      .getByTestId("price-range-badge")
      .filter({ visible: true });
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

  isMobile(): boolean {
    const vp = this.page.viewportSize();
    return vp ? vp.width < 768 : false;
  }

  /**
   * Close a project from the /projects/{id} page.
   *   - Desktop: clicks the new stacked "Mark as completed" button on
   *     the LIVE JOB card, which opens CloseProjectModal. Drives the
   *     existing modal-based flow.
   *   - Mobile: opens the kebab → ProjectActionsSheet → "Mark project
   *     as completed" → routes to /projects/{id}/close (full-screen
   *     page) and drives the segmented-control flow.
   */
  async closeJob(options?: CloseProjectOptions) {
    if (this.isMobile()) {
      await this.closeJobMobile(options);
      return;
    }
    await expect(this.markCompletedButton).toBeVisible();
    await this.markCompletedButton.click();
    await this.closeProjectModal.closeProject(options);
  }

  /** Mobile-only: drive the /projects/{id}/close full-screen page. */
  private async closeJobMobile(options?: CloseProjectOptions) {
    // Open the kebab → bottom sheet → tap "Mark project as completed".
    const kebab = this.page.getByRole("button", {
      name: "More project actions",
    });
    await expect(kebab).toBeVisible();
    await kebab.click();
    await this.page.getByTestId("project-actions-mark-complete").click();

    // Land on the close page.
    await expect(this.page).toHaveURL(/\/projects\/\d+\/close$/);
    await expect(this.page.getByTestId("close-project-page")).toBeVisible({
      timeout: 10_000,
    });

    const opts = options ?? {};
    const didGoAhead = opts.didGoAhead ?? true;

    if (didGoAhead) {
      await this.page.getByTestId("close-segment-yes").click();
      // Drive the mobile picker bottom-sheet.
      if (opts.selectFirstTradesperson || opts.tradespersonLabel) {
        await this.page.getByTestId("close-open-picker").click();
        // Recommendations group is "rec"; expand it then pick the first
        // option underneath. Picker-group buttons are toggles.
        await this.page.getByTestId("close-picker-group-rec").click();
        const firstOption = this.page
          .locator('[data-testid^="close-picker-option-"]')
          .first();
        await firstOption.click();
        await this.page.getByTestId("close-picker-done").click();
      }
    } else {
      await this.page.getByTestId("close-segment-no").click();
      const reasons = opts.reasons ?? [];
      for (const r of reasons) {
        // Mobile keeps the underscored reason key in the testid
        // (close-reason-quote_too_high) - desktop modal hyphenates.
        await this.page.getByTestId(`close-reason-${r}`).click();
      }
      if (opts.otherReasonText) {
        await this.page
          .getByTestId("close-other-text")
          .fill(opts.otherReasonText);
      }
    }

    await this.page.getByTestId("close-submit").click();
    // Mobile redirects to /projects after a successful close.
    await expect(this.page).toHaveURL(/\/projects(\?.*)?$/, { timeout: 15_000 });
  }

  /**
   * After closing as "didn't go ahead", the project becomes archived
   * and the owner can no longer see it. Visiting the URL should land
   * on the standard 404 page.
   */
  async assertNotVisibleToOwner(projectId: string | number) {
    await safeGoto(this.page, `/projects/${projectId}`);
    // Both desktop and mobile error UIs mount (md:block / md:hidden);
    // filter to whichever is visible for this viewport.
    await expect(
      this.page
        .getByText(/project not found/i)
        .or(this.page.getByText(/^404$/))
        .filter({ visible: true })
        .first(),
    ).toBeVisible({ timeout: 15_000 });
  }

  /**
   * After closing as "went ahead", the project becomes completed and
   * remains visible to the owner. Visiting the URL should still load
   * the project page (not 404). Waits for the project view to fully
   * render before returning so any follow-up navigation in the test
   * isn't interrupted by this page's in-flight load.
   */
  async assertProjectIsCompleted(projectId: string | number) {
    await safeGoto(this.page, `/projects/${projectId}`);
    await expect(this.page).toHaveURL(
      new RegExp(`/projects/${projectId}(\\?.*)?$`),
    );
    await expect(
      this.page
        .getByTestId("project-view-page")
        .or(this.page.getByTestId("closed-project-mobile"))
        .filter({ visible: true })
        .first(),
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      this.page.getByText(/project not found/i).or(this.page.getByText(/^404$/)),
    ).not.toBeVisible();
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

  /**
   * Navigate to /projects/:id and assert that the recommendation
   * surfaces. Works on the new owner swipe-deck UI (no shortlist-*
   * testids) by matching the company name on the visible page.
   * Bypasses waitUntilReady's strict gate (which expects the legacy
   * project-view-page testid).
   */
  /**
   * Assert that an on-platform recommended tradesperson is rendered in
   * the swipe deck on the project page (the company name appears on the
   * top BuilderCard). Used to verify the server's name-matcher linked an
   * incoming recommendation to a registered tradesperson.
   */
  async assertSwipeDeckShowsTradesman(
    projectId: string | number,
    tradesmanCompany: string,
  ) {
    await safeGoto(this.page, `/projects/${projectId}`);
    await expect(this.page).toHaveURL(`/projects/${projectId}`);
    // matchAndNotifyTradesman runs fire-and-forget after the rec POST, so
    // give the deck a generous window to pick up the linked rec.
    await expect(
      this.page
        .getByText(tradesmanCompany)
        .filter({ visible: true })
        .first(),
    ).toBeVisible({ timeout: 15_000 });
  }

  async assertProjectShowsRecommendation(
    projectId: string | number,
    recommendation: Recommendation,
  ) {
    // Both viewports surface off-platform recommendations on the project
    // detail page now (desktop right rail / mobile strip above the swipe
    // deck), so the assertion is the same on both.
    await safeGoto(this.page, `/projects/${projectId}`);
    await expect(this.page).toHaveURL(`/projects/${projectId}`);
    await expect(
      this.page
        .getByText(recommendation.company)
        .filter({ visible: true })
        .first(),
    ).toBeVisible({ timeout: 10_000 });
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
    await expect(this.shortlistEmptyCta).toBeVisible();
    await this.shortlistEmptyCta.click();
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
