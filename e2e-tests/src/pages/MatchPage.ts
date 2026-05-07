import { expect, type Locator, type Page } from "@playwright/test";

export class MatchPage {
  readonly page: Page;

  readonly heading: Locator;
  readonly openWhatsApp: Locator;
  readonly callButton: Locator;
  readonly emailButton: Locator;
  readonly celebrationToast: Locator;

  constructor(page: Page) {
    this.page = page;
    // /match/:id renders both a mobile branch (md:hidden) and a desktop
    // branch (hidden md:block) at the same time - both are in the DOM,
    // only one is visible per viewport. Filter to whichever is visible
    // so strict-mode locators don't trip on the duplicate text.
    this.heading = page
      .getByRole("heading", { name: /It's a match/i })
      .filter({ visible: true })
      .first();
    this.openWhatsApp = page
      .getByRole("link", { name: /WhatsApp/i })
      .filter({ visible: true })
      .first();
    this.callButton = page
      .getByRole("link", { name: /^Call /i })
      .filter({ visible: true })
      .first();
    this.emailButton = page
      .getByRole("link", { name: /^Email /i })
      .filter({ visible: true })
      .first();
    this.celebrationToast = page.getByTestId("match-celebration-toast");
  }

  async visit(matchId: string | number): Promise<void> {
    await this.page.goto(`/match/${matchId}`, { waitUntil: "domcontentloaded" });
    await expect(this.heading).toBeVisible({ timeout: 15_000 });
  }

  async hasCelebrationHeading(): Promise<void> {
    await expect(this.heading).toBeVisible({ timeout: 15_000 });
  }

  async showsBuilderName(builderName: string): Promise<void> {
    // Same dual-branch caveat as the constructor locators: filter to the
    // visible viewport branch + .first() to keep strict mode happy.
    await expect(
      this.page
        .getByText(builderName, { exact: false })
        .filter({ visible: true })
        .first(),
    ).toBeVisible({ timeout: 10_000 });
  }

  async showsEmailCta(): Promise<void> {
    await expect(this.emailButton).toBeVisible({ timeout: 10_000 });
  }

  async showsCallCta(): Promise<void> {
    await expect(this.callButton).toBeVisible({ timeout: 10_000 });
  }
}

export default MatchPage;
