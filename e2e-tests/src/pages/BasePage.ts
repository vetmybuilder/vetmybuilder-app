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
    //
    // On mobile-webkit under load, the replace() navigation occasionally
    // gets cancelled by webkit's policy checker ("Navigation canceled by
    // policy check"), leaving the page stuck on /logout. Retrying the
    // navigation once is enough to recover — it's the same webkit timing
    // quirk that shows up in other logout-heavy specs on this browser.
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await this.page
        .goto("/logout", { waitUntil: "domcontentloaded" })
        .catch(() => {});
      try {
        await this.page.waitForURL(/signedOut=1/, { timeout: 15_000 });
        return;
      } catch (err) {
        if (attempt === 1) throw err;
      }
    }
  }
}

export default BasePage;
