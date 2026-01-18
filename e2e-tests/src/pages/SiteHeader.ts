import { Page, Locator } from "@playwright/test";

export class SiteHeader {
  readonly page: Page;

  // Base
  readonly header: Locator;

  // Common / home
  readonly navHome: Locator;
  readonly navSignIn: Locator;
  readonly btnAreYouTradesperson: Locator;

  // Non-home
  readonly primaryNav: Locator;
  readonly navActions: Locator;

  // Project tabs (desktop)
  readonly tabMyProjects: Locator;
  readonly tabMyCompletedProjects: Locator;
  readonly tabCompletedCommunityProjects: Locator;
  readonly tabFavourites: Locator;
  readonly projectsTabHelper: Locator;
  readonly projectsTabHelperMobile: Locator;

  // Trades CTA
  readonly btnTradesProjects: Locator;

  // Trades menu (desktop)
  readonly tradesMenuWrapper: Locator;
  readonly tradesMenuButton: Locator;
  readonly tradesMenu: Locator;
  readonly menuManageProfile: Locator;
  readonly menuLogout: Locator;

  // Account menu (desktop)
  readonly accountMenuWrapper: Locator;
  readonly accountMenuButton: Locator;
  readonly accountMenu: Locator;

  // Mobile
  readonly btnMobileMenu: Locator;
  readonly mobileMenuPanel: Locator;
  readonly mobilePostJob: Locator;
  readonly mobileAreYouTradesperson: Locator;
  readonly mobileTradesProjects: Locator;
  readonly mobileAccount: Locator;
  readonly mobileLogout: Locator;
  readonly mobileSignIn: Locator;

  constructor(page: Page) {
    this.page = page;

    // Base
    this.header = page.getByTestId("site-header");

    // Common / home
    this.navHome = page.getByTestId("nav-home");
    this.navSignIn = page.getByTestId("nav-sign-in");
    this.btnAreYouTradesperson = page.getByTestId("btn-are-you-tradesperson");

    // Non-home
    this.primaryNav = page.getByTestId("primary-nav");
    this.navActions = page.getByTestId("nav-actions");

    // Project tabs (desktop)
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

    // Trades CTA
    this.btnTradesProjects = page.getByTestId("btn-trades-projects");

    // Trades menu (desktop)
    this.tradesMenuWrapper = page.getByTestId("trades-menu-wrapper");
    this.tradesMenuButton = page.getByTestId("trades-menu-button");
    this.tradesMenu = page.getByTestId("trades-menu");
    this.menuManageProfile = page.getByTestId("menu-manage-profile");
    this.menuLogout = page.getByTestId("menu-logout");

    // Account menu (desktop)
    this.accountMenuWrapper = page.getByTestId("account-menu-wrapper");
    this.accountMenuButton = page.getByTestId("account-menu-button");
    this.accountMenu = page.getByTestId("account-menu");

    // Mobile
    this.btnMobileMenu = page.getByTestId("btn-mobile-menu");
    this.mobileMenuPanel = page.getByTestId("mobile-menu-panel");
    this.mobilePostJob = page.getByTestId("mobile-post-job");
    this.mobileAreYouTradesperson = page.getByTestId(
      "mobile-are-you-tradesperson",
    );
    this.mobileTradesProjects = page.getByTestId("mobile-trades-projects");
    this.mobileAccount = page.getByTestId("mobile-account");
    this.mobileLogout = page.getByTestId("mobile-logout");
    this.mobileSignIn = page.getByTestId("mobile-sign-in");
  }

  initialsBadge(initials: string): Locator {
    // The initials live inside the account menu button
    return this.accountMenuButton.getByText(initials, { exact: true });
  }
}
