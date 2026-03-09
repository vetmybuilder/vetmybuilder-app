import { expect, type Locator, type Page } from "@playwright/test";
import BasePage from "./BasePage";
import Account from "../models/Account";
import Recommendation from "../models/Recommendation";

export class ProjectRecommendPage extends BasePage {
  readonly heading: Locator;
  readonly nameInput: Locator;
  readonly emailInput: Locator;
  readonly companyInput: Locator;
  readonly phoneInput: Locator;
  readonly commentInput: Locator;
  readonly fileInput: Locator;
  readonly submitButton: Locator;
  readonly successMessage: Locator;

  constructor(page: Page) {
    super(page);

    this.heading = page.getByRole("heading", { name: /Recommend for/i });
    this.nameInput = page.getByLabel("Your name");
    this.emailInput = page.getByLabel("Your email (optional)");
    this.companyInput = page.getByLabel("Company name");
    this.phoneInput = page.getByLabel("Company phone number (optional)");
    this.commentInput = page.getByLabel("Comment (min 10 characters)");
    this.fileInput = page.locator('input[type="file"]');
    this.submitButton = page.getByRole("button", {
      name: "Submit recommendation",
    });
    this.successMessage = page.getByText(
      "Thanks! Your recommendation has been submitted.",
    );
  }

  async visit(projectId: string | number) {
    await this.page.goto(`/projects/${projectId}/recommend`);
    await expect(this.page).toHaveURL(`/projects/${projectId}/recommend`);
    await expect(this.heading).toBeVisible();
  }

  async hasPrefilledIdentity(account: Account) {
    await expect(this.nameInput).toBeDisabled();
    await expect(this.emailInput).toBeDisabled();

    await expect(this.nameInput).toHaveValue(
      `${account.firstName} ${account.lastName}`.trim(),
    );
    await expect(this.emailInput).toHaveValue(account.email!);
  }

  async submitRecommendationForLoggedInUser(
    account: Account,
    recommendation: Recommendation,
    projectId: string | number,
  ) {
    await this.hasPrefilledIdentity(account);

    const payload = recommendation.toMultipartPayload();
    const { fields, photos } = payload;

    await this.companyInput.fill(fields.company);

    if (fields.phone) {
      await this.phoneInput.fill(fields.phone);
    }

    await this.commentInput.fill(fields.comment);

    if (photos?.length) {
      await this.fileInput.setInputFiles(photos);
    }

    await this.submitButton.click();
    await expect(this.successMessage).toBeVisible();

    await expect(this.page).toHaveURL(`/projects/${projectId}`, {
      timeout: 15000,
    });
  }
}

export default ProjectRecommendPage;
