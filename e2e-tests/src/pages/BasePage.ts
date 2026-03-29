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
    try {
      await this.page.goto("/logout", { waitUntil: "domcontentloaded" });
    } catch (err: unknown) {
      // On WebKit, a form-redirect navigation can still be in-flight after
      // toHaveURL() passes. The goto is interrupted; wait for it to settle
      // and retry once.
      if (
        err instanceof Error &&
        err.message.includes("interrupted by another navigation")
      ) {
        await this.page.waitForLoadState("load", { timeout: 10_000 }).catch(() => {});
        await this.page.goto("/logout", { waitUntil: "domcontentloaded" });
      } else {
        throw err;
      }
    }
    await expect(this.page).toHaveURL(/signedOut=1/);
  }
}

export default BasePage;
