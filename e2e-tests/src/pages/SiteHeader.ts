import { Page, Locator } from "@playwright/test";

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

  readonly btnMobileMenu: Locator;
  readonly mobileMenuPanel: Locator;
  readonly mobilePostJob: Locator;
  readonly mobileAreYouTradesperson: Locator;
  readonly mobileTradesProjects: Locator;
  readonly mobileAccount: Locator;
  readonly mobileLogout: Locator;
  readonly mobileSignIn: Locator;

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
    this.menuLogout = page.getByTestId("menu-logout");

    this.accountMenuWrapper = page.getByTestId("account-menu-wrapper");
    this.accountMenuButton = page.getByTestId("account-menu-button");
    this.accountMenu = page.getByTestId("account-menu");

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
}
