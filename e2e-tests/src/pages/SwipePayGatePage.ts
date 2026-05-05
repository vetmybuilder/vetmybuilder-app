import { expect, type Locator, type Page } from "@playwright/test";
import BasePage from "./BasePage";

type TierId = "week_1" | "week_2" | "month_1";

/**
 * Full-screen pay-gate that opens when an unsubscribed tradesman right-
 * swipes a subscribed-tier job on /tradesman/jobs. Lets the tradesman
 * pick a subscription pass or pay one-off without leaving the deck.
 */
export class SwipePayGatePage extends BasePage {
  readonly root: Locator;
  readonly tiers: Locator;
  readonly cta: Locator;
  readonly oneOffButton: Locator;
  readonly backButton: Locator;
  readonly confirmOverlay: Locator;
  readonly confirmAmount: Locator;

  constructor(page: Page) {
    super(page);
    // SwipePayGate renders both a mobile and a desktop branch (the off-
    // viewport one is display:none via md:hidden / hidden md:block).
    // Filter to the visible variant so a strict-mode-locator match
    // doesn't pick the off-screen sibling.
    this.root = page.getByTestId("swipe-paygate").filter({ visible: true });
    this.tiers = page
      .getByTestId("swipe-paygate-tiers")
      .filter({ visible: true });
    this.cta = page.getByTestId("swipe-paygate-cta").filter({ visible: true });
    this.oneOffButton = page
      .getByTestId("swipe-paygate-oneoff")
      .filter({ visible: true });
    this.backButton = page
      .getByTestId("swipe-paygate-back")
      .filter({ visible: true });
    this.confirmOverlay = page
      .getByTestId("swipe-paygate-confirm")
      .filter({ visible: true });
    this.confirmAmount = page
      .getByTestId("swipe-paygate-confirm-amount")
      .filter({ visible: true });
  }

  async expectVisibleFor(jobTitle: string): Promise<void> {
    await expect(this.root).toBeVisible({ timeout: 10_000 });
    await expect(this.root).toContainText(jobTitle);
    await expect(this.tiers).toBeVisible();
  }

  async expectClosed(): Promise<void> {
    await expect(this.root).toHaveCount(0, { timeout: 10_000 });
  }

  async selectTier(tier: TierId): Promise<void> {
    const button = this.page
      .getByTestId(`swipe-paygate-tier-${tier}`)
      .filter({ visible: true });
    await button.click();
    await expect(button).toHaveAttribute("aria-checked", "true");
  }

  /**
   * Choose a subscription tier and complete the mock checkout. The mock
   * provider activates the subscription server-side immediately, so the
   * gate closes itself and the deck is ready to re-fire the swipe.
   */
  async paySubscription(tier: TierId): Promise<void> {
    await this.selectTier(tier);
    await this.cta.click();
  }

  /**
   * Trigger the one-off unlock flow. Mock provider charges immediately,
   * the gate flashes the "Unlock activated" confirmation, then routes
   * to /tradesman/unlock/sent.
   */
  async payOneOff(): Promise<void> {
    await this.oneOffButton.click();
  }

  async tapBack(): Promise<void> {
    await this.backButton.click();
  }

  async expectActivatedFor(amountLabel: string): Promise<void> {
    await expect(this.confirmOverlay).toBeVisible({ timeout: 10_000 });
    await expect(this.confirmAmount).toContainText(amountLabel);
  }
}

export default SwipePayGatePage;
