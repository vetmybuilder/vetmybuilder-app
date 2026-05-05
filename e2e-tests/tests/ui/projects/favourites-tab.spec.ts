import { test } from "../../../src/ui.fixtures";
import Tradesman from "../../../src/models/tradesman";
import { setupTradesmanProfile } from "../../../src/apiHelper/tradesman/setupTradesmanProfile";

test.describe("Favourites tab", () => {
  test("shows empty state when no favourites saved", async ({
    homeownerProjectsPage,
  }) => {
    await homeownerProjectsPage.gotoTab("favourites");
    await homeownerProjectsPage.expectFavouritesEmpty();
  });

  test("favourite tradesman card shows company name", async ({
    request,
    runtime,
    apiClient,
    homeownerProjectsPage,
  }) => {
    const companyName = `Fav Builder ${Date.now()} Ltd`;
    const tradesman = Tradesman.aTradesman()
      .withRandomDetails()
      .withCompanyName(companyName);

    const { uid } = await setupTradesmanProfile({
      request,
      apiBaseUrl: runtime.apiBaseUrl,
      tradesman,
    });

    await apiClient.addFavouriteTradesman(uid);

    await homeownerProjectsPage.gotoTab("favourites");
    await homeownerProjectsPage.expectFavouriteCardVisible(companyName);
  });

  test("clicking a favourite card navigates to tradesman profile", async ({
    request,
    runtime,
    apiClient,
    homeownerProjectsPage,
  }) => {
    const { uid } = await setupTradesmanProfile({
      request,
      apiBaseUrl: runtime.apiBaseUrl,
    });

    await apiClient.addFavouriteTradesman(uid);

    await homeownerProjectsPage.gotoTab("favourites");
    await homeownerProjectsPage.clickFirstFavouriteCard();
    await homeownerProjectsPage.expectNavigatedToTradesmanProfile();
  });

  test("count subtitle reflects number of saved favourites", async ({
    request,
    runtime,
    apiClient,
    homeownerProjectsPage,
  }) => {
    const first = await setupTradesmanProfile({
      request,
      apiBaseUrl: runtime.apiBaseUrl,
    });
    const second = await setupTradesmanProfile({
      request,
      apiBaseUrl: runtime.apiBaseUrl,
    });

    await apiClient.addFavouriteTradesman(first.uid);
    await apiClient.addFavouriteTradesman(second.uid);

    await homeownerProjectsPage.gotoTab("favourites");
    await homeownerProjectsPage.expectFavouritesCount(2);
  });
});
