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
    await this.page.goto("/logout", { waitUntil: "domcontentloaded" });
    await expect(this.page).toHaveURL(/signedOut=1/);
  }
}

export default BasePage;
