import { test, expect } from "../../../src/ui.fixtures";
import Tradesman from "../../../src/models/tradesman";

test.describe("Tradesman external review-platform links", () => {
  test("displays review links on the public profile when set", async ({
    page,
    apiClient,
  }) => {
    const trustpilotUrl = `https://www.trustpilot.com/review/example-${Date.now()}.com`;
    const barkUrl = `https://www.bark.com/en/gb/company/example-${Date.now()}/`;

    const tradesman = Tradesman.aTradesman()
      .withRandomDetails()
      .withReviewLinks([
        { platform: "trustpilot", url: trustpilotUrl },
        { platform: "bark", url: barkUrl },
      ]);

    await apiClient.put("/api/tradesmen/me", tradesman.toPayload());

    const userId = await apiClient.getTradesmanUserId();
    await page.goto(`/tradesman/${userId}`);
    await expect(page.getByTestId("tradesman-review-links-section")).toBeVisible({ timeout: 15_000 });

    const trustpilot = page.getByTestId("tradesman-review-link-trustpilot").getByRole("link");
    await expect(trustpilot).toHaveAttribute("href", trustpilotUrl);
    await expect(trustpilot).toContainText("View on Trustpilot");
    await expect(trustpilot).toHaveAttribute("rel", /nofollow/);
    await expect(trustpilot).toHaveAttribute("target", "_blank");

    const bark = page.getByTestId("tradesman-review-link-bark").getByRole("link");
    await expect(bark).toHaveAttribute("href", barkUrl);
    await expect(bark).toContainText("View on Bark");
  });

  test("hides the review section when no links are set", async ({
    page,
    apiClient,
  }) => {
    const tradesman = Tradesman.aTradesman().withRandomDetails();
    await apiClient.put("/api/tradesmen/me", tradesman.toPayload());

    const userId = await apiClient.getTradesmanUserId();
    await page.goto(`/tradesman/${userId}`);
    await expect(page.getByTestId("tradesman-contact-card")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("tradesman-review-links-section")).toHaveCount(0);
  });

  test("server drops invalid review URLs and keeps valid ones", async ({
    apiClient,
  }) => {
    const tradesman = Tradesman.aTradesman()
      .withRandomDetails()
      .withReviewLinks([
        { platform: "bark", url: "https://www.trustpilot.com/review/x" },
        { platform: "houzz", url: "" },
        { platform: "checkatrade", url: "https://www.checkatrade.com/trades/test" },
      ]);

    await apiClient.put("/api/tradesmen/me", tradesman.toPayload());

    await apiClient.expectReviewLinks([
      { platform: "checkatrade", url: "https://www.checkatrade.com/trades/test" },
    ]);
  });
});
