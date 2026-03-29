import { expect, type Locator, type Page } from "@playwright/test";
import type Recommendation from "../models/Recommendation";

export class MagicLinkPage {
  readonly page: Page;

  readonly form: Locator;
  readonly nameInput: Locator;
  readonly companyInput: Locator;
  readonly commentInput: Locator;
  readonly submitButton: Locator;
  readonly submittedConfirmation: Locator;

  constructor(page: Page) {
    this.page = page;

    this.form = page.getByTestId("magic-form");
    this.nameInput = page.getByLabel("Your name");
    this.companyInput = page.getByLabel("Company / Tradesperson", {
      exact: true,
    });
    this.commentInput = page.getByLabel("Comment (min 10 characters)");
    this.submitButton = page.getByRole("button", {
      name: "Send recommendation",
    });
    this.submittedConfirmation = page.getByTestId("magic-submitted");
  }

  async visit(token: string): Promise<void> {
    await this.page.goto(`/r/${token}`, { waitUntil: "domcontentloaded" });
    await expect(this.form).toBeVisible({ timeout: 15_000 });
  }

  async submit(recommendation: Recommendation): Promise<void> {
    await expect(this.nameInput).toBeVisible();
    await this.nameInput.fill("Test Recommender");
    await this.companyInput.fill(recommendation.company);
    await this.commentInput.fill(recommendation.comment);
    await expect(this.submitButton).toBeEnabled();
    await this.submitButton.click();
  }

  async hasSubmitConfirmation(): Promise<void> {
    await expect(this.submittedConfirmation).toBeVisible({ timeout: 15_000 });
  }
}

export default MagicLinkPage;
