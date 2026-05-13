import { expect, type Locator, type Page } from "@playwright/test";
import BasePage from "./BasePage";

export type IncomingLeadDetails = {
  title: string;
  outward?: string;
  pickedYou?: boolean;
  /**
   * "your-network" - "Recommended by your network" fallback (production
   * scrubs the recommender's first name on incoming leads)
   * "hidden" - subscribed-source leads render no recommender attribution
   */
  recommenderAttribution?: "your-network" | "hidden";
};

/**
 * /tradesman/leads (mobile) - the incoming-interest carousel a
 * tradesperson sees when a homeowner has picked them but they
 * haven't responded yet. Wraps IncomingLeadCard.
 *
 * The leads page renders different components for mobile and desktop
 * (IncomingLeadCard vs DesktopLeadRow). This page model targets the
 * mobile component; specs using it should skip on the desktop project.
 */
export class TradesmanLeadsDeckPage extends BasePage {
  readonly root: Locator;
  readonly topCard: Locator;
  readonly passButton: Locator;
  readonly acceptButton: Locator;
  readonly emptyHeading: Locator;

  constructor(page: Page) {
    super(page);
    this.root = page.getByTestId("tradesman-leads-deck");
    // First (top) lead card in the snap-carousel. Each card is an
    // IncomingLeadCard, the carousel keeps the active one centred.
    this.topCard = this.root.locator("article, > div > div > div").first();
    this.passButton = page.getByTestId("mobile-lead-pass");
    this.acceptButton = page.getByTestId("mobile-lead-accept");
    this.emptyHeading = page.getByRole("heading", {
      name: /No-one'?s picked you yet/i,
    });
  }

  async goto(): Promise<void> {
    await this.page.goto("/tradesman/leads", { waitUntil: "domcontentloaded" });
    await expect(this.root).toBeVisible({ timeout: 15_000 });
  }

  async expectDeckEmpty(): Promise<void> {
    await expect(this.emptyHeading).toBeVisible({ timeout: 10_000 });
  }

  /**
   * Asserts every detail IncomingLeadCard surfaces for the top lead.
   * Only fields set on `details` are checked.
   */
  async hasIncomingLeadDetails(details: IncomingLeadDetails): Promise<void> {
    const card = this.root.locator("article, > div > div > div").filter({
      hasText: details.title,
    });
    await expect(card.first()).toBeVisible({ timeout: 15_000 });
    const lead = card.first();

    if (details.outward) {
      await expect(lead).toContainText(details.outward);
    }
    if (details.pickedYou) {
      await expect(lead).toContainText(/picked you/i);
    }
    if (details.recommenderAttribution === "your-network") {
      await expect(lead).toContainText(/Recommended by your network/i);
    }
    if (details.recommenderAttribution === "hidden") {
      await expect(lead).not.toContainText(/Recommended by/i);
    }
  }
}

export default TradesmanLeadsDeckPage;
