import { test } from "../../../src/ui.fixtures";
import Tradesman from "../../../src/models/tradesman";
import { setupTradesmanProfile } from "../../../src/apiHelper/tradesman/setupTradesmanProfile";

test.describe("Tradesman public profile", () => {
  test("renders the full profile when seeded with photo, trades and review links", async ({
    request,
    runtime,
    tradesmanPublicProfilePage,
  }) => {
    const builder = await setupTradesmanProfile({
      request,
      apiBaseUrl: runtime.apiBaseUrl,
      tradesman: Tradesman.aTradesman()
        .withRandomDetails()
        .withCompanyName("Profile Spec Builders Ltd")
        .withTradeTypes("plumbing")
        .withPhotoUrls(["https://cdn.example.com/cover.jpg"])
        .withProfilePictureUrl("https://cdn.example.com/cover.jpg")
        .withReviewLinks([
          {
            platform: "trustpilot",
            url: `https://www.trustpilot.com/review/full-${Date.now()}.com`,
          },
          {
            platform: "bark",
            url: `https://www.bark.com/en/gb/company/full-${Date.now()}/`,
          },
        ]),
    });

    await tradesmanPublicProfilePage.visit(builder.uid);
    await tradesmanPublicProfilePage.hasProfile(builder.tradesman);
  });

  test("falls back to initials and hides the review section when nothing extra is set", async ({
    request,
    runtime,
    tradesmanPublicProfilePage,
  }) => {
    const builder = await setupTradesmanProfile({
      request,
      apiBaseUrl: runtime.apiBaseUrl,
      tradesman: Tradesman.aTradesman()
        .withRandomDetails()
        .withCompanyName("Minimal Profile Co Ltd")
        .withTradeTypes("plumbing"),
    });

    await tradesmanPublicProfilePage.visit(builder.uid);
    await tradesmanPublicProfilePage.hasProfile(builder.tradesman);
  });
});
