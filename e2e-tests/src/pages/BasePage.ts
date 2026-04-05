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
    await this.page.getByTestId("account-menu-button").click();
    await this.page.getByTestId("menu-logout").click();
    await expect(this.page).toHaveURL(/signedOut=1/, { timeout: 15_000 });
  }

  async logoutViaUrl() {
    // domcontentloaded fires before React hydrates, so useEffect (which calls
    // window.location.replace) cannot run until after goto resolves — no race.
    await this.page.goto("/logout", { waitUntil: "domcontentloaded" }).catch(() => {});
    await this.page.waitForURL(/signedOut=1/, { timeout: 20_000 });
  }
}

export default BasePage;
