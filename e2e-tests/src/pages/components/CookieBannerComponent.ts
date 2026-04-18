import { expect, type Locator, type Page } from "@playwright/test";

export class CookieBannerComponent {
  readonly bannerText: Locator;
  readonly acceptButton: Locator;

  constructor(private readonly page: Page) {
    this.bannerText = page.getByText(/We use cookies to keep you signed in/i);
    this.acceptButton = page.locator("#rcc-confirm-button");
  }

  async expectVisible() {
    await expect(this.bannerText).toBeVisible({ timeout: 15_000 });
    await expect(this.acceptButton).toBeVisible();
  }

  async expectHidden() {
    await expect(this.bannerText).not.toBeVisible({ timeout: 5_000 });
  }

  async accept() {
    await this.acceptButton.click();
  }

  async clearConsentCookie() {
    await this.page.context().clearCookies({ name: "vmb_cookie_consent" });
  }

  async expectConsentCookieSet() {
    const cookies = await this.page.context().cookies();
    const cookie = cookies.find((c) => c.name === "vmb_cookie_consent");
    expect(cookie, "vmb_cookie_consent cookie should be set").toBeTruthy();
    expect(cookie!.value).toBe("true");
  }
}

export default CookieBannerComponent;
