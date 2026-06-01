import { expect, type Locator, type Page } from "@playwright/test";

/**
 * Page object for the public homepage (`/`).
 *
 * The homepage shows three persona variants driven by auth state and the
 * `vmb:isTradesman` sessionStorage flag (set by the auth bootstrap when
 * the signed-in user has a tradesperson role):
 *
 *   - Guest        — not signed in. CTAs route to `/signup` and stash a
 *                    returnTo so the user lands back here after auth.
 *   - Homeowner    — signed in, isTradesman flag NOT set. Hero CTA goes
 *                    to `/projects/new`; secondary "My projects" link
 *                    sits next to it.
 *   - Tradesperson — signed in, isTradesman flag set. Hero CTA goes to
 *                    `/tradesman/jobs`; the "Local tradespeople" eyebrow
 *                    is hidden.
 *
 * The HomeStats section is hidden until the live community count clears
 * its threshold (see `web/components/home/HomeStats.tsx`). E2E tests
 * always run on a freshly-wiped DB so the section should never render.
 */
export class HomePage {
  readonly page: Page;

  readonly header: Locator;
  readonly heroCta: Locator;
  readonly headerPostAJob: Locator;
  readonly heroPostAJobMobile: Locator;
  readonly localTradespeopleEyebrow: Locator;
  readonly myProjectsLink: Locator;
  readonly seeHowItWorksButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.header = page.getByRole("banner", { name: "Site header" });
    this.heroCta = page.locator('[data-testid="hero-cta"]:visible');
    this.headerPostAJob = page.getByTestId("home-header-post-job");
    // The guest's primary "Post a job" CTA. On desktop it lives in the header
    // (`home-header-post-job`, hidden below the `sm` breakpoint); on mobile the
    // header CTA is hidden and the hero renders its own "Post a job" link.
    this.heroPostAJobMobile = page.getByTestId("hero-cta-mobile");
    this.localTradespeopleEyebrow = page.getByText(
      "Hundreds of vetted tradespeople nearby.",
      {
        exact: true,
      },
    );
    this.myProjectsLink = page.getByRole("link", { name: "My projects" });
    this.seeHowItWorksButton = page.locator(
      'button:visible:has-text("See how it works")',
    );
  }

  async goto() {
    // /projects shards keep the `users` table across test runs so the
    // live community count creeps up as a suite runs - which would
    // intermittently push the homepage over the HomeStats threshold and
    // change what the page renders. Stub /api/stats to a known zero
    // baseline so persona-rendering tests are deterministic and the
    // "stats hidden" test always sees the below-threshold variant.
    await this.page.route("**/api/stats", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          communityMembers: 0,
          recommendations: 0,
          shortlists: 0,
        }),
      });
    });

    await this.page.goto("/");
    await expect(this.header).toBeVisible();
  }

  /**
   * Force the page into the tradesperson variant before navigation.
   *   - Pre-seed the `vmb:isTradesman` sessionStorage flag the homepage
   *     reads at render time.
   *   - Pin the flag against overwrites: SiteHeader's role check would
   *     otherwise race the flag back to "0" because the auto-login test
   *     user is a homeowner in the DB. We monkey-patch sessionStorage
   *     so any write to that one key is a no-op for the lifetime of
   *     the page, leaving every other key writeable.
   *   - Stub `/api/tradesmen/me` to belt-and-braces report a tradesperson
   *     role for any other consumer of that endpoint.
   */
  async asTradesperson() {
    await this.page.addInitScript(() => {
      try {
        sessionStorage.setItem("vmb:isTradesman", "1");
        const orig = Storage.prototype.setItem;
        Storage.prototype.setItem = function (key: string, value: string) {
          if (this === sessionStorage && key === "vmb:isTradesman") return;
          return orig.call(this, key, value);
        };
      } catch {
        /* noop */
      }
    });
    await this.page.route("**/api/tradesmen/me", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          role: "tradesman",
          profile: { company_name: "Test Trades Ltd" },
        }),
      });
    });
  }

  async expectHeroCtaLabel(label: string | RegExp) {
    await expect(this.heroCta).toBeVisible({ timeout: 15_000 });
    await expect(this.heroCta).toHaveText(label);
  }

  async clickHeroCta() {
    await expect(this.heroCta).toBeVisible({ timeout: 15_000 });
    await this.heroCta.click();
  }

  /**
   * Resolves to whichever "Post a job" CTA is the live one for the current
   * viewport: the header CTA on desktop, the hero CTA on mobile (where the
   * header CTA is hidden below Tailwind's `sm` breakpoint, 640px).
   */
  private postAJobCta(): Locator {
    const viewport = this.page.viewportSize();
    const isMobile = !!viewport && viewport.width < 640;
    return isMobile ? this.heroPostAJobMobile : this.headerPostAJob;
  }

  async expectPostAJobCtaLabel(label: string | RegExp) {
    await expect(this.postAJobCta()).toBeVisible({ timeout: 15_000 });
    await expect(this.postAJobCta()).toHaveText(label);
  }

  async clickPostAJobCta() {
    await expect(this.postAJobCta()).toBeVisible({ timeout: 15_000 });
    await this.postAJobCta().click();
  }

  async clickMyProjectsLink() {
    await expect(this.myProjectsLink).toBeVisible({ timeout: 15_000 });
    await this.myProjectsLink.click();
  }

  async expectNoMyProjectsLink() {
    await expect(this.myProjectsLink).toHaveCount(0);
  }

  async clickSeeHowItWorks() {
    await expect(this.seeHowItWorksButton).toBeVisible({ timeout: 15_000 });
    await this.seeHowItWorksButton.click();
  }

  async expectScrolledToHowItWorks() {
    await expect(this.page.locator("#how-it-works")).toBeInViewport();
  }

  async expectLocalTradespeopleEyebrow() {
    await expect(this.localTradespeopleEyebrow).toBeVisible({
      timeout: 15_000,
    });
  }

  async expectNoLocalTradespeopleEyebrow() {
    await expect(this.localTradespeopleEyebrow).toHaveCount(0);
  }

  async expectUrl(url: string | RegExp) {
    await expect(this.page).toHaveURL(url, { timeout: 15_000 });
  }
}

export default HomePage;
