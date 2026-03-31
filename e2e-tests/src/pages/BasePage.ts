import { expect, type Locator, type Page } from "@playwright/test";
import { PublishModalComponent } from "./components/PublishModalComponent";

export class BasePage {
  readonly page: Page;

  readonly publishModal: PublishModalComponent;
  readonly publishDialog: Locator;

  constructor(page: Page) {
    this.page = page;

    this.publishDialog = page.getByTestId("get-recs-modal");
    this.publishModal = new PublishModalComponent(page);
  }

  async assertPublishModalVisible() {
    await expect(this.publishDialog).toBeVisible();
  }

  async assertPublishModalHidden() {
    await expect(this.publishDialog).toBeHidden();
  }

  async logout() {
    await this.page.waitForLoadState("load", { timeout: 10_000 }).catch(() => {});

    // Navigate to /logout and wait for the client-side Firebase signOut to
    // complete and redirect to /?signedOut=1. On WebKit the redirect can stall,
    // so we retry the navigation once if still on /logout after 15 s.
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        await this.page.goto("/logout", { waitUntil: "domcontentloaded" });
      } catch (err: unknown) {
        if (
          err instanceof Error &&
          err.message.includes("interrupted by another navigation")
        ) {
          await this.page
            .waitForLoadState("load", { timeout: 10_000 })
            .catch(() => {});
        } else {
          throw err;
        }
      }

      if (/signedOut=1/.test(this.page.url())) break;

      await this.page
        .waitForURL(/signedOut=1/, { timeout: 15_000 })
        .catch(() => {});

      if (/signedOut=1/.test(this.page.url())) break;
      // Still on /logout — retry the navigation once
    }

    await expect(this.page).toHaveURL(/signedOut=1/, { timeout: 15_000 });
    await this.page.waitForLoadState("load", { timeout: 10_000 }).catch(() => {});
  }
}

export default BasePage;
