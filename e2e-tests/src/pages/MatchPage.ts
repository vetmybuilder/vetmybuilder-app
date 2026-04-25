// e2e-tests/src/pages/MatchPage.ts
//
// Page object for the match-formed celebration page at /match/:matchId.
// The page fetches /api/matches/:matchId and renders the other party's
// contact details.

import { expect, type Locator, type Page } from "@playwright/test";

export class MatchPage {
  readonly page: Page;

  readonly heading: Locator;
  readonly openWhatsApp: Locator;
  readonly callButton: Locator;
  readonly emailButton: Locator;

  constructor(page: Page) {
    this.page = page;

    this.heading = page.getByRole("heading", { name: /It's a match/i });
    this.openWhatsApp = page.getByRole("link", { name: /Open in WhatsApp/i });
    this.callButton = page.getByRole("link", { name: /^Call$/ });
    this.emailButton = page.getByRole("link", { name: /^Email$/ });
  }

  async visit(matchId: string | number): Promise<void> {
    await this.page.goto(`/match/${matchId}`, { waitUntil: "domcontentloaded" });
  }

  async hasCelebrationHeading(): Promise<void> {
    await expect(this.heading).toBeVisible({ timeout: 15_000 });
  }

  async showsEmailCta(): Promise<void> {
    await expect(this.emailButton).toBeVisible({ timeout: 10_000 });
  }

  async showsCallCta(): Promise<void> {
    await expect(this.callButton).toBeVisible({ timeout: 10_000 });
  }

  async showsBuilderName(builderName: string): Promise<void> {
    await expect(
      this.page.getByText(builderName, { exact: false }),
    ).toBeVisible({ timeout: 10_000 });
  }
}

export default MatchPage;
