import { test } from "../../../src/fixtures";
import Tradesman from "../../../src/models/tradesman";

test.describe("PUT /api/tradesmen/me - review links validation", () => {
  test("server drops invalid review URLs and keeps valid ones", async ({
    apiClient,
  }) => {
    const tradesman = Tradesman.aTradesman()
      .withRandomDetails()
      .withReviewLinks([
        { platform: "bark", url: "https://www.trustpilot.com/review/x" },
        { platform: "houzz", url: "" },
        {
          platform: "checkatrade",
          url: "https://www.checkatrade.com/trades/test",
        },
      ]);

    await apiClient.put("/api/tradesmen/me", tradesman.toPayload());

    await apiClient.expectReviewLinks([
      {
        platform: "checkatrade",
        url: "https://www.checkatrade.com/trades/test",
      },
    ]);
  });
});
