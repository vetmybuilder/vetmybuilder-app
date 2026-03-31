import { expect, type Locator, type Page } from "@playwright/test";
import BasePage from "./BasePage";

export class TradesmanMyProfilePage extends BasePage {
  readonly avatarImg: Locator;
  readonly avatarInitials: Locator;

  constructor(page: Page) {
    super(page);
    this.avatarImg = page.getByTestId("profile-avatar-img");
    this.avatarInitials = page.getByTestId("profile-avatar-initials");
  }

  async goto() {
    await this.page.goto("/tradesman/profile", {
      waitUntil: "domcontentloaded",
    });
    await this.waitUntilReady();
  }

  async waitUntilReady() {
    await expect(this.page.getByTestId("tradesman-page")).toBeVisible({
      timeout: 20_000,
    });
  }

  async assertAvatarIsPhoto() {
    await expect(this.avatarImg).toBeVisible({ timeout: 10_000 });
    await expect(this.avatarInitials).not.toBeVisible();
  }

  async assertAvatarIsInitials() {
    await expect(this.avatarInitials).toBeVisible({ timeout: 10_000 });
    await expect(this.avatarImg).not.toBeVisible();
  }

  async getAvatarSrc(): Promise<string> {
    await expect(this.avatarImg).toBeVisible({ timeout: 10_000 });
    return (await this.avatarImg.getAttribute("src")) ?? "";
  }
}

export default TradesmanMyProfilePage;
