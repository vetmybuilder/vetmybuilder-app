import { test, expect } from "../../../src/fixtures";
import {
  authedApiForUid,
  getUidFromJoinResponse,
} from "../../../src/api/services/client";

test.describe("GET /api/admin/tradesmen", () => {
  test("Returns 401 when no user is signed in", async ({ request, runtime }) => {
    const res = await request.get(
      `${runtime.apiBaseUrl}/api/admin/tradesmen`,
    );
    expect(res.status()).toBe(401);
  });

  test("Returns 403 when a non-admin user accesses the list", async ({
    request,
    runtime,
  }) => {
    const nonAdminUid = `user-${Date.now()}`;
    const client = await authedApiForUid(
      request,
      runtime.apiBaseUrl,
      nonAdminUid,
    );
    const res = await client.get("/api/admin/tradesmen");
    expect(res.status()).toBe(403);
  });

  test("Returns an empty list when searching for a company that does not exist", async ({
    adminApiClient,
  }) => {
    const nonExistent = `NONEXISTENT_${Date.now()}`;
    const res = await adminApiClient.get(
      `/api/admin/tradesmen?q=${encodeURIComponent(nonExistent)}`,
    );
    expect(res.status()).toBe(200);

    const body: any = await res.json();
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.items).toHaveLength(0);
    expect(body.total).toBe(0);
  });

  test("Returns the expected pagination envelope (total, page, pageSize)", async ({
    adminApiClient,
  }) => {
    const joinRes = await adminApiClient.joinTradesmanDraft();
    expect(joinRes.status()).toBe(201);

    const res = await adminApiClient.get(
      "/api/admin/tradesmen?page=1&pageSize=10",
    );
    expect(res.status()).toBe(200);

    const body: any = await res.json();
    expect(typeof body.total).toBe("number");
    expect(body.page).toBe(1);
    expect(body.pageSize).toBe(10);
  });

  test("Returns the newly registered tradesman in the list with core fields", async ({
    adminApiClient,
  }) => {
    const companyName = `List Co ${Date.now()}`;
    const joinRes = await adminApiClient.joinTradesmanDraft({
      companyName,
    });
    expect(joinRes.status()).toBe(201);
    const uid = await getUidFromJoinResponse(joinRes);

    const res = await adminApiClient.get("/api/admin/tradesmen");
    expect(res.status()).toBe(200);

    const body: any = await res.json();
    const row = (body.items as any[]).find((it) => it.user_id === uid);
    expect(row).toBeTruthy();
    expect(row.company_name).toBe(companyName);
    expect(row.status).toBe("draft");
    expect(typeof row.openFlags).toBe("number");
    expect(typeof row.unlocksApproved).toBe("number");
    expect(typeof row.unlocksPending).toBe("number");
  });

  test("Filters to only draft tradesmen when status=draft is requested", async ({
    adminApiClient,
  }) => {
    // Two drafts
    await adminApiClient.joinTradesmanDraft({
      companyName: `Draft A ${Date.now()}`,
    });
    await adminApiClient.joinTradesmanDraft({
      companyName: `Draft B ${Date.now()}`,
    });

    const res = await adminApiClient.get(
      "/api/admin/tradesmen?status=draft",
    );
    expect(res.status()).toBe(200);

    const body: any = await res.json();
    expect(body.items.length).toBeGreaterThanOrEqual(2);
    for (const item of body.items) {
      expect(item.status).toBe("draft");
    }
  });

  test("Returns no results for status=active when the created tradesman is in draft", async ({
    adminApiClient,
  }) => {
    const unique = `DraftOnly_${Date.now()}`;
    await adminApiClient.joinTradesmanDraft({ companyName: unique });

    const res = await adminApiClient.get(
      `/api/admin/tradesmen?status=active&q=${encodeURIComponent(unique)}`,
    );
    expect(res.status()).toBe(200);

    const body: any = await res.json();
    expect(body.items).toHaveLength(0);
    expect(body.total).toBe(0);
  });

  test("Searches by company name and returns only matching tradesmen", async ({
    adminApiClient,
  }) => {
    const unique = `SearchTarget_${Date.now()}`;
    const joinRes = await adminApiClient.joinTradesmanDraft({
      companyName: unique,
    });
    expect(joinRes.status()).toBe(201);
    const uid = await getUidFromJoinResponse(joinRes);

    // Also create a tradesman that should NOT appear
    await adminApiClient.joinTradesmanDraft({
      companyName: `Other Co ${Date.now()}`,
    });

    const res = await adminApiClient.get(
      `/api/admin/tradesmen?q=${encodeURIComponent(unique)}`,
    );
    expect(res.status()).toBe(200);

    const body: any = await res.json();
    expect(body.items).toHaveLength(1);
    expect(body.items[0].user_id).toBe(uid);
    expect(body.items[0].company_name).toBe(unique);
  });

  test("Respects pageSize parameter and returns the correct number of rows", async ({
    adminApiClient,
  }) => {
    await adminApiClient.joinTradesmanDraft({
      companyName: `Paged A ${Date.now()}`,
    });
    await adminApiClient.joinTradesmanDraft({
      companyName: `Paged B ${Date.now()}`,
    });
    await adminApiClient.joinTradesmanDraft({
      companyName: `Paged C ${Date.now()}`,
    });

    const res = await adminApiClient.get(
      "/api/admin/tradesmen?pageSize=2&page=1",
    );
    expect(res.status()).toBe(200);

    const body: any = await res.json();
    expect(body.items.length).toBeLessThanOrEqual(2);
    expect(body.total).toBeGreaterThanOrEqual(3);
    expect(body.pageSize).toBe(2);
  });

  test("openFlags count increments when admin creates a flag on the tradesman", async ({
    adminApiClient,
  }) => {
    const joinRes = await adminApiClient.joinTradesmanDraft();
    expect(joinRes.status()).toBe(201);
    const uid = await getUidFromJoinResponse(joinRes);

    // Before flag: openFlags should be 0
    const before: any = await (
      await adminApiClient.get("/api/admin/tradesmen")
    ).json();
    const rowBefore = before.items.find((it: any) => it.user_id === uid);
    expect(rowBefore.openFlags).toBe(0);

    // Add a flag
    const flagRes = await adminApiClient.post(
      `/api/admin/tradesmen/${uid}/flag`,
      { reason: "test flag", severity: "warn" },
    );
    expect(flagRes.status()).toBe(201);

    // After flag: openFlags should be 1
    const after: any = await (
      await adminApiClient.get("/api/admin/tradesmen")
    ).json();
    const rowAfter = after.items.find((it: any) => it.user_id === uid);
    expect(rowAfter.openFlags).toBe(1);
  });
});
