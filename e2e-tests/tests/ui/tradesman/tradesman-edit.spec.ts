import { test } from "../../../src/ui.fixtures";
import Tradesman from "../../../src/models/tradesman";

const PHOTOS = [
  "https://cdn.example.com/work-a.jpg",
  "https://cdn.example.com/work-b.jpg",
  "https://cdn.example.com/work-c.jpg",
];

test.describe("Tradesman edit profile", () => {
  test("first uploaded photo is auto-selected and shows on the profile after save", async ({
    apiClient,
    tradesmanEditPage,
    tradesmanPublicProfilePage,
  }) => {
    const tradesman = Tradesman.aTradesman()
      .withRandomDetails()
      .withPhotoUrls(PHOTOS);
    await apiClient.put("/api/tradesmen/me", tradesman.toPayload());

    await tradesmanEditPage.goto();
    await tradesmanEditPage.goToStep2();
    await tradesmanEditPage.assertProfileBadgeVisible();
    await tradesmanEditPage.goToStep3();
    await tradesmanEditPage.save();

    const uid = await apiClient.getTradesmanUserId();
    await tradesmanPublicProfilePage.visit(uid);
    await tradesmanPublicProfilePage.expectAvatarSrc(PHOTOS[0]);
  });

  test("changing the profile picture selection persists on the profile", async ({
    apiClient,
    tradesmanEditPage,
    tradesmanPublicProfilePage,
  }) => {
    const tradesman = Tradesman.aTradesman()
      .withRandomDetails()
      .withPhotoUrls(PHOTOS);
    await apiClient.put("/api/tradesmen/me", tradesman.toPayload());

    await tradesmanEditPage.goto();
    await tradesmanEditPage.goToStep2();
    await tradesmanEditPage.clickExistingPhoto(1);
    await tradesmanEditPage.assertProfileBadgeCount(1);
    await tradesmanEditPage.goToStep3();
    await tradesmanEditPage.save();

    const uid = await apiClient.getTradesmanUserId();
    await tradesmanPublicProfilePage.visit(uid);
    await tradesmanPublicProfilePage.expectAvatarSrc(PHOTOS[1]);
  });

  test("editing every wizard field shows the new values on the public profile", async ({
    apiClient,
    tradesmanEditPage,
    tradesmanPublicProfilePage,
  }) => {
    const initial = Tradesman.aTradesman()
      .withRandomDetails()
      .withServiceAreas("E1")
      .withTradeTypes("Plumber");
    await apiClient.put("/api/tradesmen/me", initial.toPayload());

    const updated = Tradesman.aTradesman()
      .withCompanyName(initial.companyName)
      .withPhone("07999888777")
      .withWebsite("https://updated-example.com")
      .withServiceAreas("E4")
      .withTradeTypes("Electrician")
      .withWarrantyMonths(12)
      .withOffersDiscount(true)
      .withReviewLinks([
        {
          platform: "trustpilot",
          url: "https://www.trustpilot.com/review/updated-example.com",
        },
      ]);
    const updatedContactName = "Updated Contact";
    const updatedInstagram = "https://www.instagram.com/updated-handle";
    const updatedDiscountMax = 30;

    // ---- Step 1 ----
    await tradesmanEditPage.goto();
    await tradesmanEditPage.fillContactName(updatedContactName);
    await tradesmanEditPage.fillPhone(updated.phone!);
    await tradesmanEditPage.removeServiceArea("E1");
    await tradesmanEditPage.addServiceArea(updated.serviceAreas!);
    await tradesmanEditPage.fillWebsite(updated.website!);
    await tradesmanEditPage.fillSocial("instagram", updatedInstagram);
    await tradesmanEditPage.fillReviewLink(
      "trustpilot",
      updated.reviewLinks![0].url,
    );

    // ---- Step 2 ----
    await tradesmanEditPage.goToStep2();
    await tradesmanEditPage.toggleTradeType("Plumber");
    await tradesmanEditPage.toggleTradeType(updated.tradeTypes!);

    // ---- Step 3 ----
    await tradesmanEditPage.goToStep3();
    await tradesmanEditPage.setDiscountMax(updatedDiscountMax);
    await tradesmanEditPage.setWarranty("12m");
    await tradesmanEditPage.save();

    // ---- Verify on the public profile ----
    const uid = await apiClient.getTradesmanUserId();
    await tradesmanPublicProfilePage.visit(uid);
    await tradesmanPublicProfilePage.hasProfile(updated);

    // contactName + socials aren't rendered on the public profile, so
    // verify those by re-opening the wizard and reading the form state.
    await tradesmanEditPage.goto();
    await tradesmanEditPage.assertContactNameValue(updatedContactName);
    await tradesmanEditPage.assertSocialValue("instagram", updatedInstagram);
  });
});
