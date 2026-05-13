import { test } from "../../../src/ui.fixtures";
import Tradesman from "../../../src/models/tradesman";
import { setupIncomingLead } from "../../../src/apiHelper/swipeMatching/setupIncomingLead";

// IncomingLeadCard renders only on the mobile leads deck; desktop uses
// a different component (DesktopLeadRow). These specs target the
// mobile component and skip on the desktop project.

test.describe("Tradesperson sees incoming leads", () => {
  test("Tradesperson sees a recommended incoming lead", async ({
    request,
    runtime,
    apiClient,
    adminApi,
    swipeMatchingApi,
    tradesmanLeadsDeckPage,
  }, testInfo) => {
    test.skip(
      !testInfo.project.name.startsWith("ui-mobile-"),
      "IncomingLeadCard renders only on the mobile leads deck",
    );

    const tradesman = Tradesman.aTradesman()
      .withRandomDetails()
      .withCompanyName(`Lead Receiver Co ${Date.now()}`)
      .withServiceAreas("E4")
      .withTradeTypes("Plumbing");

    const seedRes = await apiClient.put("/api/tradesmen/me", tradesman.toPayload());
    if (seedRes.status() !== 200) {
      throw new Error(`Failed to seed tradesman: ${seedRes.status()}`);
    }
    const tradesmanUid = await apiClient.getTradesmanUserId();
    await adminApi.setTradesmanStatus(tradesmanUid, "active");

    const lead = await setupIncomingLead({
      request,
      apiBaseUrl: runtime.apiBaseUrl,
      swipeMatchingApi,
      tradesmanUid,
      tradesmanCompany: tradesman.companyName,
      location: "E4",
      source: "recommended",
    });

    await tradesmanLeadsDeckPage.goto();

    await tradesmanLeadsDeckPage.hasIncomingLeadDetails({
      title: lead.projectTitle,
      outward: "E4",
      pickedYou: true,
      recommenderAttribution: "your-network",
    });
  });

  test("Tradesperson sees a subscribed incoming lead", async ({
    request,
    runtime,
    apiClient,
    adminApi,
    swipeMatchingApi,
    tradesmanLeadsDeckPage,
  }, testInfo) => {
    test.skip(
      !testInfo.project.name.startsWith("ui-mobile-"),
      "IncomingLeadCard renders only on the mobile leads deck",
    );

    const tradesman = Tradesman.aTradesman()
      .withRandomDetails()
      .withCompanyName(`Subscribed Receiver Co ${Date.now()}`)
      .withServiceAreas("E4")
      .withTradeTypes("Plumbing");

    const seedRes = await apiClient.put("/api/tradesmen/me", tradesman.toPayload());
    if (seedRes.status() !== 200) {
      throw new Error(`Failed to seed tradesman: ${seedRes.status()}`);
    }
    const tradesmanUid = await apiClient.getTradesmanUserId();
    await adminApi.setTradesmanStatus(tradesmanUid, "active");

    const lead = await setupIncomingLead({
      request,
      apiBaseUrl: runtime.apiBaseUrl,
      swipeMatchingApi,
      tradesmanUid,
      tradesmanCompany: tradesman.companyName,
      location: "E4",
      source: "subscribed",
    });

    await tradesmanLeadsDeckPage.goto();

    await tradesmanLeadsDeckPage.hasIncomingLeadDetails({
      title: lead.projectTitle,
      outward: "E4",
      pickedYou: true,
      recommenderAttribution: "hidden",
    });
  });
});
