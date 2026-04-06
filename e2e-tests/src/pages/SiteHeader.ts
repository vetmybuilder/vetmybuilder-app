import { Page, Locator, expect } from "@playwright/test";

export class SiteHeader {
  readonly page: Page;

  readonly header: Locator;

  readonly navHome: Locator;
  readonly navSignIn: Locator;
  readonly btnAreYouTradesperson: Locator;

  readonly primaryNav: Locator;
  readonly navActions: Locator;

  readonly tabMyProjects: Locator;
  readonly tabMyCompletedProjects: Locator;
  readonly tabCompletedCommunityProjects: Locator;
  readonly tabFavourites: Locator;
  readonly projectsTabHelper: Locator;
  readonly projectsTabHelperMobile: Locator;

  readonly btnTradesProjects: Locator;

  readonly tradesMenuWrapper: Locator;
  readonly tradesMenuButton: Locator;
  readonly tradesMenu: Locator;
  readonly menuManageProfile: Locator;
  readonly menuLogout: Locator;

  readonly accountMenuWrapper: Locator;
  readonly accountMenuButton: Locator;
  readonly accountMenu: Locator;

  readonly menuEditAccount: Locator;

  readonly btnMobileMenu: Locator;
  readonly mobileMenu: Locator;
  readonly mobileAccount: Locator;
  readonly mobileLogout: Locator;
  readonly mobilePostJob: Locator;

  readonly accountInitialsBadgeMobile: Locator;

  constructor(page: Page) {
    this.page = page;

    this.header = page.getByTestId("site-header");

    this.navHome = page.getByTestId("nav-home");
    this.navSignIn = page.getByTestId("nav-sign-in");
    this.btnAreYouTradesperson = page.getByTestId("btn-are-you-tradesperson");

    this.primaryNav = page.getByTestId("primary-nav");
    this.navActions = page.getByTestId("nav-actions");

    this.tabMyProjects = page.getByTestId("tab-my-projects");
    this.tabMyCompletedProjects = page.getByTestId("tab-my-completed-projects");
    this.tabCompletedCommunityProjects = page.getByTestId(
      "tab-completed-community-projects",
    );
    this.tabFavourites = page.getByTestId("tab-favourites");
    this.projectsTabHelper = page.getByTestId("projects-tab-helper");
    this.projectsTabHelperMobile = page.getByTestId(
      "projects-tab-helper-mobile",
    );

    this.btnTradesProjects = page.getByTestId("btn-trades-projects");

    this.tradesMenuWrapper = page.getByTestId("trades-menu-wrapper");
    this.tradesMenuButton = page.getByTestId("trades-menu-button");
    this.tradesMenu = page.getByTestId("trades-menu");
    this.menuManageProfile = page.getByTestId("menu-manage-profile");
    this.menuLogout = page.getByLabel("Logout");

    this.accountMenuWrapper = page.getByTestId("account-menu-wrapper");
    this.accountMenuButton = page.getByTestId("account-menu-button");
    this.accountMenu = page.getByTestId("account-menu");

    this.menuEditAccount = page.getByRole("menuitem", { name: "Edit account" });

    this.btnMobileMenu = page.getByTestId("btn-mobile-menu");
    this.mobileMenu = page.getByTestId("mobile-menu");
    this.mobileAccount = page.getByTestId("mobile-menu-account");
    this.mobileLogout = page.getByTestId("mobile-menu-logout");
    this.mobilePostJob = page.getByTestId("mobile-menu-post-job");

    this.accountInitialsBadgeMobile = page.getByTestId(
      "account-initials-badge-mobile",
    );
  }

  initialsBadge(initials: string): Locator {
    return this.page
      .locator(
        [
          `[data-testid="account-menu-button"] span[aria-hidden="true"]:visible`,
          `[data-testid="account-initials-badge-mobile"] span[aria-hidden="true"]:visible`,
        ].join(", "),
      )
      .filter({ hasText: initials })
      .first();
  }

  private async isMobileNav(): Promise<boolean> {
    return await this.btnMobileMenu.isVisible();
  }

  async openMobileMenu() {
    await expect(this.btnMobileMenu).toBeVisible();
    await this.btnMobileMenu.click();
    await expect(this.mobileMenu).toBeVisible();
  }

  async openAccountMenu() {
    // Desktop only
    await expect(this.accountMenuButton).toBeVisible();
    await this.accountMenuButton.click();
    await expect(this.accountMenu).toBeVisible();
  }

  async goToEditAccount() {
    if (await this.isMobileNav()) {
      await this.openMobileMenu();
      await expect(this.mobileAccount).toBeVisible();
      await this.mobileAccount.click();
      await expect(this.page).toHaveURL("/account", { timeout: 15_000 });
      return;
    }

    await this.openAccountMenu();
    await expect(this.menuEditAccount).toBeVisible();
    await this.menuEditAccount.click();
    await expect(this.page).toHaveURL("/account", { timeout: 15_000 });
  }

  async assertInitials(initials: string) {
    await expect(this.initialsBadge(initials)).toBeVisible({ timeout: 15_000 });
  }

  async assertGuestState() {
    // accountMenuButton is the reliable cross-device signal — it's absent on
    // mobile (inside hidden md:flex) and hidden on desktop when logged out.
    // navSignIn is desktop-only (hidden sm:inline-flex) so can't be used here.
    await expect(this.accountMenuButton).not.toBeVisible({ timeout: 10_000 });
  }

  async signOut() {
    if (await this.isMobileNav()) {
      await this.openMobileMenu();
      await expect(this.mobileLogout).toBeVisible();
      await this.mobileLogout.click();
      await this.page.waitForURL("/");
      return;
    }

    await this.openAccountMenu();
    await this.menuLogout.click();
    await this.page.waitForURL("/");
  }
}

export default SiteHeader;
