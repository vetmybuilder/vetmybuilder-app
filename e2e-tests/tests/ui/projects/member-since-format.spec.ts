import { test } from "../../../src/ui.fixtures";
import { setupTradesmanProfile } from "../../../src/apiHelper/tradesman/setupTradesmanProfile";

test.describe("Member since format", () => {
  test("tradesman profile shows 'Member since [Month] [Year]' without day", async ({
    request,
    runtime,
    tradesmanPublicProfilePage,
  }) => {
    const { uid } = await setupTradesmanProfile({
      request,
      apiBaseUrl: runtime.apiBaseUrl,
    });

    await tradesmanPublicProfilePage.visit(uid);
    await tradesmanPublicProfilePage.expectMemberSinceFormat();
  });
});
