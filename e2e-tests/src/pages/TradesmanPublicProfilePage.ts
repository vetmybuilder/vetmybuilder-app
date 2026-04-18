import { expect, type Locator, type Page } from "@playwright/test";
import BasePage from "./BasePage";

export class TradesmanPublicProfilePage extends BasePage {
  readonly root: Locator;
  readonly memberSince: Locator;

  constructor(page: Page) {
    super(page);
    this.root = page.getByTestId("tradesman-page");
    this.memberSince = page.getByText(/Member since \w+ \d{4}/);
  }

  async visit(uid: string) {
    await this.page.goto(`/tradesman/${uid}`);
    await expect(this.root).toBeVisible({ timeout: 15_000 });
  }

  async expectMemberSinceFormat() {
    await expect(this.memberSince).toBeVisible({ timeout: 10_000 });
    const text = await this.memberSince.textContent();
    expect(text, "Member since should be 'Month Year' without a day number").toMatch(
      /^Member since [A-Z][a-z]+ \d{4}$/,
    );
  }
}

export default TradesmanPublicProfilePage;
