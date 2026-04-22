import { test, expect } from "../../../src/ui.fixtures";
import Tradesman from "../../../src/models/tradesman";
import { setupOwnerWithLiveProject } from "../../../src/apiHelper/project/setupOwnerWithLiveProject";

test.describe("Payment gating", () => {
  test("tradesman sees gated job before payment and unlocked after", async ({
    request,
    runtime,
    apiClient,
    adminApi,
    tradesmanProjectsPage,
    mockCheckoutPage,
  }) => {
    const location = "E4";

    const { projectId } = await setupOwnerWithLiveProject({
      request,
      apiBaseUrl: runtime.apiBaseUrl,
      location,
    });

    const tradesman = Tradesman.aTradesman().withRandomDetails();
    tradesman.serviceAreas = location;
    tradesman.tradeTypes = "General Builder";
    await apiClient.put("/api/tradesmen/me", {
      ...tradesman.toPayload(),
      service_areas: location,
      trade_types: "General Builder",
    });

    const tradesmanUid = await apiClient.getTradesmanUserId();
    await adminApi.setTradesmanStatus(tradesmanUid, "active");

    await tradesmanProjectsPage.visit();
    await tradesmanProjectsPage.expandProject(projectId);
    await tradesmanProjectsPage.expectJobGated(projectId);

    await tradesmanProjectsPage.clickUnlockJob(projectId);
    await mockCheckoutPage.expectOnCheckout();
    await mockCheckoutPage.pay();

    await expect(tradesmanProjectsPage.page).toHaveURL(/tradesman\/projects/, { timeout: 15_000 });

    await tradesmanProjectsPage.expandProject(projectId);
    await tradesmanProjectsPage.expectJobUnlocked(projectId);
  });
});
