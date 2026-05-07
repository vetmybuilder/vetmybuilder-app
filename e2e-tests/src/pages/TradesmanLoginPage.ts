import { expect, type Locator, type Page } from "@playwright/test";
import BasePage from "./BasePage";
import { safeGoto } from "../helpers/navigation";

export class TradesmanLoginPage extends BasePage {
  readonly interstitial: Locator;
  readonly interstitialHeading: Locator;
  readonly continueAsTradespersonButton: Locator;
  readonly signOutButton: Locator;

  constructor(page: Page) {
    super(page);
    this.interstitial = page.getByTestId("tradesman-login-interstitial");
    this.interstitialHeading = this.interstitial.getByRole("heading", {
      name: /Pick up where you left off/i,
    });
    this.continueAsTradespersonButton = page.getByTestId(
      "interstitial-continue-as-tradesperson",
    );
    this.signOutButton = page.getByTestId("interstitial-sign-out");
  }

  async goto() {
    await safeGoto(this.page, "/tradesman/login");
  }

  async expectInterstitialVisible() {
    await expect(this.interstitial).toBeVisible();
    await expect(this.interstitialHeading).toBeVisible();
  }

  async expectInterstitialNotVisible() {
    await expect(this.interstitial).toHaveCount(0);
  }

  async expectRedirectedTo(pattern: RegExp) {
    await expect(this.page).toHaveURL(pattern, { timeout: 15_000 });
  }

  async continueAsTradesperson() {
    await this.continueAsTradespersonButton.click();
    await this.expectRedirectedTo(/\/tradesman\/signup\/complete/);
  }

  async signOutAndStartOver() {
    await this.signOutButton.click();
    await this.page.waitForURL(
      (url) => new URL(url.toString()).pathname === "/",
      { timeout: 15_000 },
    );
  }

  async expectRedirectedAwayFromLogin() {
    await this.page.waitForURL(
      (url) => !new URL(url.toString()).pathname.endsWith("/tradesman/login"),
      { timeout: 15_000 },
    );
    await this.expectInterstitialNotVisible();
  }
}

export default TradesmanLoginPage;
