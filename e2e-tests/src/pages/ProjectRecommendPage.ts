import { Page, Locator, expect } from "@playwright/test";

export class ProjectRecommendPage {
  readonly page: Page;
  readonly name: Locator;
  readonly email: Locator;
  readonly recommendationCard: Locator;
  readonly recommendationSubmittedConfirmation: Locator;

  constructor(page: Page) {
    this.page = page;
    this.name = page.getByLabel("Your name", { exact: true });
    this.email = page.getByLabel("Your email");
    this.recommendationCard = page.getByTestId("recommendation-card");
    this.recommendationSubmittedConfirmation =
      page.getByTestId("magic-submitted");
  }

  async goto() {
    await this.page.goto("/login");
  }

  async addRecommendationViaForm(opts: {
    name?: string; // optional for anonymous users
    email?: string; // optional for anonymous users
    company: string;
    phone?: string;
    hireAgain: "yes" | "no";
    comment: string;
    withPhoto?: boolean;
  }): Promise<void> {
    const { name, email, company, phone, hireAgain, comment, withPhoto } = opts;

    // Fill name if editable
    if (name) {
      const nameInput = this.page.getByLabel("Your name", { exact: true });
      if (await nameInput.isVisible()) {
        const disabled = await nameInput.isDisabled();
        const readOnly = (await nameInput.getAttribute("readonly")) !== null;
        if (!disabled && !readOnly) await nameInput.fill(name);
      }
    }

    // Fill email if editable
    if (email) {
      const emailInput = this.page.getByLabel("Your email (optional)", {
        exact: true,
      });
      if (await emailInput.isVisible()) {
        const disabled = await emailInput.isDisabled();
        const readOnly = (await emailInput.getAttribute("readonly")) !== null;
        if (!disabled && !readOnly) await emailInput.fill(email);
      }
    }

    await this.page
      .getByLabel("Company / Tradesperson", { exact: true })
      .fill(company);

    if (phone) {
      await this.page
        .getByLabel("Company / Tradesperson phone (optional)", { exact: true })
        .fill(phone);
    }

    await this.page
      .getByLabel(hireAgain === "yes" ? "Yes" : "No", { exact: true })
      .check();
    await this.page
      .getByLabel("Comment (min 10 characters)", { exact: true })
      .fill(comment);

    if (withPhoto) {
      const pngTiny = Buffer.from(
        "89504E470D0A1A0A0000000D49484452000000010000000108020000009077053E0000000A49444154789C6360000002000154010D0A0000000049454E44AE426082",
        "hex"
      );
      await this.page
        .getByLabel("Photos (up to 8, max 8MB each)", { exact: true })
        .setInputFiles({
          name: "tiny.png",
          mimeType: "image/png",
          buffer: pngTiny,
        });
    }

    const submitBtn = this.page.getByRole("button", {
      name: "Send recommendation",
    });
    await expect(submitBtn).toBeEnabled();
    await submitBtn.click();
  }
}
