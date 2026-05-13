import { test, expect } from "../../../src/fixtures";
import Project from "../../../src/models/Project";
import Tradesman from "../../../src/models/tradesman";
import { setupTradesmanProfile } from "../../../src/apiHelper/tradesman/setupTradesmanProfile";

// GET /api/tradesmen/:uid/recent-completed
test.describe("GET /api/tradesmen/:uid/recent-completed", () => {
  test("returns topTradesperson=false when no boosted closures exist", async ({
    apiClient,
    request,
    runtime,
  }) => {
    const tradesman = Tradesman.aTradesman().withRandomDetails();
    const { uid } = await setupTradesmanProfile({
      request,
      apiBaseUrl: runtime.apiBaseUrl,
      tradesman,
    });

    const res = await apiClient.get(
      `/api/tradesmen/${encodeURIComponent(uid)}/recent-completed`,
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      items: [],
      topTradesperson: false,
    });
  });

  test("returns the boosted closure with anonymised area + photos after a close-with-boost", async ({
    apiClient,
    projectApi,
    request,
    runtime,
  }) => {
    // 1. Seed a tradesperson the homeowner will pick as the winner.
    const tradesmanCompany = `Recent Completed Co ${Date.now()}`;
    const tradesman = Tradesman.aTradesman()
      .withRandomDetails()
      .withCompanyName(tradesmanCompany);
    const { uid: builderUid } = await setupTradesmanProfile({
      request,
      apiBaseUrl: runtime.apiBaseUrl,
      tradesman,
    });

    // 2. Homeowner posts a project then closes it with the tradesperson
    //    as winner AND boost=true.
    const project = await projectApi.createProject(
      Project.aProject()
        .withRandomDetails({ locationQuery: "E4", locationPick: "E4" })
        .toApiPayload(),
    );

    await projectApi.closeProject(project.id, {
      didGoAhead: true,
      winnerTradesmanUid: builderUid,
      satisfied: "yes",
      boostConsent: true,
    });

    // 3. Endpoint surfaces the closure.
    const res = await apiClient.get(
      `/api/tradesmen/${encodeURIComponent(builderUid)}/recent-completed`,
    );
    expect(res.status()).toBe(200);
    const body = await res.json();

    expect(body.topTradesperson).toBe(true);
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.items.length).toBeGreaterThanOrEqual(1);

    const first = body.items[0];
    expect(first.area).toBe("E4"); // outward only - no full postcode
    expect(typeof first.projectType === "string" || first.projectType === null).toBe(true);
    expect(Array.isArray(first.photos)).toBe(true);
  });

  test("does NOT surface a closure when boost is unchecked", async ({
    apiClient,
    projectApi,
    request,
    runtime,
  }) => {
    const tradesmanCompany = `No Boost Co ${Date.now()}`;
    const tradesman = Tradesman.aTradesman()
      .withRandomDetails()
      .withCompanyName(tradesmanCompany);
    const { uid: builderUid } = await setupTradesmanProfile({
      request,
      apiBaseUrl: runtime.apiBaseUrl,
      tradesman,
    });

    const project = await projectApi.createProject(
      Project.aProject().withRandomDetails().toApiPayload(),
    );

    // Close as satisfied=yes but DON'T tick boost. The closure happens
    // but the tradesperson must not appear on this surface.
    await projectApi.closeProject(project.id, {
      didGoAhead: true,
      winnerTradesmanUid: builderUid,
      satisfied: "yes",
      boostConsent: false,
    });

    const res = await apiClient.get(
      `/api/tradesmen/${encodeURIComponent(builderUid)}/recent-completed`,
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.items).toEqual([]);
    expect(body.topTradesperson).toBe(false);
  });
});
