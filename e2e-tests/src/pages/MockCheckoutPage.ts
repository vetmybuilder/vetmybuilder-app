import { expect, type Page } from "@playwright/test";
import BasePage from "./BasePage";

export class MockCheckoutPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async expectOnCheckout() {
    await expect(this.page).toHaveURL(/payments\/mock\/checkout/, { timeout: 15_000 });
  }

  async pay() {
    await this.page.getByTestId("btn-mock-pay").click();
  }
}

export default MockCheckoutPage;
