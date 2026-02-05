import { expect, type Locator, type Page } from "@playwright/test";
import { PublishModalComponent } from "./components/PublishModalComponent";

export class BasePage {
  readonly page: Page;

  // Shared / global UI
  readonly publishModal: PublishModalComponent;
  readonly publishDialog: Locator;

  constructor(page: Page) {
    this.page = page;

    // Modal root (present across pages when opened)
    this.publishDialog = page.getByTestId("get-recs-modal");

    // Components
    this.publishModal = new PublishModalComponent(page);
  }

  async assertPublishModalVisible() {
    await expect(this.publishDialog).toBeVisible();
  }

  async assertPublishModalHidden() {
    await expect(this.publishDialog).toBeHidden();
  }
}

export default BasePage;
