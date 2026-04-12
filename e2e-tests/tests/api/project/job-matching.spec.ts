// Verifies that GET /api/tradesmen/jobs:
//   1. Includes a numeric `matchScore` on every item
//   2. Returns items sorted by matchScore DESC
//
// The scoring logic itself is unit-tested in tests/server/jobMatching.spec.ts.
// This spec covers the endpoint wiring: tradesman profile lookup, classification
// fetch, score computation, response shape, and sort order.

import { test, expect } from "../../../src/fixtures";
import Project from "../../../src/models/Project";
import { authedApiForUid, getUidFromJoinResponse } from "../../../src/api/services/client";

test.describe("GET /api/tradesmen/jobs — match scoring", () => {
  test("returns 401 when unauthenticated", async ({ request, runtime }) => {
    const res = await request.get(`${runtime.apiBaseUrl}/api/tradesmen/jobs`);
    expect(res.status()).toBe(401);
  });

  test("returns 403 when the user has no tradesman profile", async ({
    request,
    runtime,
  }) => {
    const uid = `non-tm-${Date.now()}`;
    const client = await authedApiForUid(request, runtime.apiBaseUrl, uid);

    await client.post("/api/auth/signup", {
      firstName: "Homeowner",
      lastName: "Test",
      location: "E4",
    });

    const res = await client.get("/api/tradesmen/jobs");
    expect(res.status()).toBe(403);
  });

  test("items include a numeric matchScore and are sorted by relevance", async ({
    request,
    runtime,
    projectApi,
    adminApiClient,
  }) => {
    // 1. Create a live project so there's at least one job in the list
    await projectApi.createLiveProject(
      Project.aProject().withRandomDetails().toApiPayload(),
    );

    // 2. Create a real user who will become the active tradesman
    const builderUid = `tm-jobs-${Date.now()}`;
    const builderClient = await authedApiForUid(
      request,
      runtime.apiBaseUrl,
      builderUid,
    );
    await builderClient.post("/api/auth/signup", {
      firstName: "Jobs",
      lastName: "Tradesman",
      location: "E4",
    });

    // 3. Create a lead with trade/area details then promote it to the real UID
    const joinRes = await adminApiClient.joinTradesmanDraft({
      companyName: `Jobs Test Co ${Date.now()}`,
      email: `jobs-tm-${Date.now()}@test.com`,
    });
    expect(joinRes.status()).toBe(201);
    const leadUid = await getUidFromJoinResponse(joinRes);

    // Set trade_types + service_areas on the lead before promoting, so the
    // scorer has something to match against the project.
    await adminApiClient.post(`/api/admin/tradesmen/${leadUid}/status`, {
      status: "active",
      assignTo: builderUid,
    });

    // 4. Fetch jobs as the now-active tradesman
    const jobsRes = await builderClient.get("/api/tradesmen/jobs");
    expect(jobsRes.status()).toBe(200);

    const body: any = await jobsRes.json();

    // Response shape
    expect(Array.isArray(body.items)).toBe(true);
    expect(typeof body.total).toBe("number");

    // Every item carries a numeric matchScore (0–100)
    for (const item of body.items) {
      expect(typeof item.matchScore).toBe("number");
      expect(item.matchScore).toBeGreaterThanOrEqual(0);
      expect(item.matchScore).toBeLessThanOrEqual(100);
    }

    // Items are sorted matchScore DESC
    for (let i = 1; i < body.items.length; i++) {
      expect(body.items[i - 1].matchScore).toBeGreaterThanOrEqual(
        body.items[i].matchScore,
      );
    }
  });
});
