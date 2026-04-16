import { test, expect } from "../../../src/ui.fixtures";
import Tradesman from "../../../src/models/tradesman";

/**
 * Coverage for the external-review-platform link feature.
 *
 * Tradespeople can attach links to their own profile on Trustpilot,
 * Bark, MyBuilder, Checkatrade, Houzz, Yell. The links are stored on
 * the tradesmen row (review_links_json column), returned by
 * /api/tradesmen/:publicId, and rendered as plain text "View on
 * <Platform>" links on the public profile page.
 *
 * We exercise the API + display path here rather than driving the full
 * registration wizard - the wizard is multi-step and slow, and the
 * field plumbing is exercised by the unit tests at
 * tests/web/utils/reviewLinks.test.ts.
 */
test.describe("Tradesman external review-platform links", () => {
  test("renders the External reviews section with the correct link when set", async ({
    page,
    apiClient,
  }) => {
    const tradesman = Tradesman.aTradesman().withRandomDetails();
    const trustpilotUrl = `https://www.trustpilot.com/review/example-${Date.now()}.com`;
    const barkUrl = `https://www.bark.com/en/gb/company/example-${Date.now()}/`;

    // Set up the profile via the API (faster than walking the wizard)
    // and include two review links.
    const putRes = await apiClient.put("/api/tradesmen/me", {
      ...tradesman.toPayload(),
      reviewLinks: [
        { platform: "trustpilot", url: trustpilotUrl },
        { platform: "bark", url: barkUrl },
      ],
    });
    expect(putRes.status()).toBe(200);

    // Look up the tradesperson's public_id from /api/tradesmen/me
    const meRes = await apiClient.get("/api/tradesmen/me");
    const meBody = await meRes.json();
    const publicId =
      meBody?.profile?.public_id || meBody?.profile?.publicId;
    expect(publicId, "tradesperson should have a public_id after save").toBeTruthy();

    // Visit the public profile and assert both links render.
    await page.goto(`/tradesman/${publicId}`);

    const section = page.getByTestId("tradesman-review-links-section");
    await expect(section).toBeVisible();

    const trustpilotLink = page.getByTestId("tradesman-review-link-trustpilot");
    await expect(trustpilotLink).toBeVisible();
    await expect(trustpilotLink.getByRole("link")).toHaveAttribute(
      "href",
      trustpilotUrl,
    );
    await expect(trustpilotLink.getByRole("link")).toContainText(
      "View on Trustpilot",
    );
    // Outbound links to user-supplied URLs should be marked nofollow
    // so we don't pass SEO weight to anything the tradesperson submits.
    await expect(trustpilotLink.getByRole("link")).toHaveAttribute(
      "rel",
      /nofollow/,
    );
    // Should open in a new tab to keep the user on VetMyBuilder.
    await expect(trustpilotLink.getByRole("link")).toHaveAttribute(
      "target",
      "_blank",
    );

    const barkLink = page.getByTestId("tradesman-review-link-bark");
    await expect(barkLink.getByRole("link")).toHaveAttribute("href", barkUrl);
    await expect(barkLink.getByRole("link")).toContainText("View on Bark");
  });

  test("does NOT render the External reviews section when no links are set", async ({
    page,
    apiClient,
  }) => {
    const tradesman = Tradesman.aTradesman().withRandomDetails();
    await apiClient.put("/api/tradesmen/me", tradesman.toPayload());

    const meRes = await apiClient.get("/api/tradesmen/me");
    const meBody = await meRes.json();
    const publicId =
      meBody?.profile?.public_id || meBody?.profile?.publicId;
    expect(publicId).toBeTruthy();

    await page.goto(`/tradesman/${publicId}`);

    // The contact card should still be there...
    await expect(page.getByTestId("tradesman-contact-card")).toBeVisible();
    // ...but the review-links section should be absent.
    await expect(
      page.getByTestId("tradesman-review-links-section"),
    ).toHaveCount(0);
  });

  test("rejects an invalid review URL on save (server-side filter)", async ({
    apiClient,
  }) => {
    const tradesman = Tradesman.aTradesman().withRandomDetails();

    // Server should accept the request but silently drop the bad entry
    // (the wrong domain for the declared platform).
    await apiClient.put("/api/tradesmen/me", {
      ...tradesman.toPayload(),
      reviewLinks: [
        // Trustpilot URL submitted under bark - not a bark domain
        { platform: "bark", url: "https://www.trustpilot.com/review/x" },
        // Empty url
        { platform: "houzz", url: "" },
        // Valid one to confirm filtering keeps the good ones
        {
          platform: "checkatrade",
          url: "https://www.checkatrade.com/trades/test",
        },
      ],
    });

    const meRes = await apiClient.get("/api/tradesmen/me");
    const meBody = await meRes.json();
    // The two bad ones are dropped; only checkatrade survives.
    const stored = JSON.parse(meBody?.profile?.review_links_json || "[]");
    expect(stored).toEqual([
      {
        platform: "checkatrade",
        url: "https://www.checkatrade.com/trades/test",
      },
    ]);
  });
});
