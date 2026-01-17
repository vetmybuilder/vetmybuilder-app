import { test, expect } from "../../../src/fixtures";
import Tradesman from "../../../src/models/tradesman";
import { authedApiForUid } from "../../../src/api/services/client";
import { uniq } from "../../../src/utils/formatters";

test.describe("POST /api/admin/tradesmen/:uid/status (promotion)", () => {
  test("admin can promote a lead_* tradesman into a real uid (active)", async ({
    request,
    runtime,
    adminApiClient,
  }) => {
    const lead = Tradesman.aTradesman()
      .withRandomDetails()
      .withWebsites(["https://example.com"])
      .withDocs(0)
      .withWorkPhotos(0)
      .withOffer({ discountMin: 0, discountMax: 0, warranty: "none" })
      .withLikesCount(0)
      .withWinsCount(0);

    const joinRes = await request.post(
      `${runtime.apiBaseUrl}/api/tradesmen/join`,
      {
        data: lead.toJoinPayload(),
      },
    );
    expect(joinRes.status()).toBe(201);

    const joinBody = await joinRes.json();
    expect(joinBody.ok).toBe(true);
    expect(joinBody.created).toBe(true);
    expect(typeof joinBody.id).toBe("string");
    expect(joinBody.id.startsWith("lead_")).toBe(true);

    const leadId = joinBody.id as string;

    const targetUid = uniq("tm-promote");
    const targetClient = await authedApiForUid(
      request,
      runtime.apiBaseUrl,
      targetUid,
    );

    await targetClient.post("/api/account", { username: uniq("u") });

    const promoteRes = await adminApiClient.post(
      `/api/admin/tradesmen/${leadId}/status`,
      { status: "active", assignTo: targetUid },
    );
    expect(promoteRes.status()).toBe(200);

    const body = await promoteRes.json();
    expect(body.ok).toBe(true);
    expect(body.promoted).toBe(true);
    expect(body.assignTo).toBe(targetUid);

    expect(body.tradesman).toBeTruthy();
    expect(body.tradesman.user_id).toBe(targetUid);
    expect(String(body.tradesman.status || "").toLowerCase()).toBe("active");
    expect(String(body.tradesman.verification_status || "").toLowerCase()).toBe(
      "approved",
    );
  });

  test("admin can set a lead_* to inactive without promotion", async ({
    request,
    runtime,
    adminApiClient,
  }) => {
    const lead = Tradesman.aTradesman()
      .withRandomDetails()
      .withWebsites(["https://example.com"])
      .withDocs(0)
      .withWorkPhotos(0)
      .withOffer({ discountMin: 0, discountMax: 0, warranty: "none" })
      .withLikesCount(0)
      .withWinsCount(0);

    const joinRes = await request.post(
      `${runtime.apiBaseUrl}/api/tradesmen/join`,
      {
        data: lead.toJoinPayload(),
      },
    );
    expect(joinRes.status()).toBe(201);

    const joinBody = await joinRes.json();
    const leadId = joinBody.id as string;

    const res = await adminApiClient.post(
      `/api/admin/tradesmen/${leadId}/status`,
      { status: "inactive" },
    );

    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.promoted).toBe(false);

    expect(body.tradesman).toBeTruthy();
    expect(body.tradesman.user_id).toBe(leadId);
    expect(String(body.tradesman.status || "").toLowerCase()).toBe("inactive");
  });

  test("admin can set a lead_* to draft without promotion (verification resets to unverified)", async ({
    request,
    runtime,
    adminApiClient,
  }) => {
    const lead = Tradesman.aTradesman()
      .withRandomDetails()
      .withWebsites(["https://example.com"])
      .withDocs(0)
      .withWorkPhotos(0)
      .withOffer({ discountMin: 0, discountMax: 0, warranty: "none" })
      .withLikesCount(0)
      .withWinsCount(0);

    const joinRes = await request.post(
      `${runtime.apiBaseUrl}/api/tradesmen/join`,
      {
        data: lead.toJoinPayload(),
      },
    );
    expect(joinRes.status()).toBe(201);

    const joinBody = await joinRes.json();
    const leadId = joinBody.id as string;

    const res = await adminApiClient.post(
      `/api/admin/tradesmen/${leadId}/status`,
      { status: "draft" },
    );

    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.promoted).toBe(false);

    expect(body.tradesman).toBeTruthy();
    expect(body.tradesman.user_id).toBe(leadId);
    expect(String(body.tradesman.status || "").toLowerCase()).toBe("draft");
    expect(String(body.tradesman.verification_status || "").toLowerCase()).toBe(
      "unverified",
    );
  });

  test("admin can set a real tradesman to inactive", async ({
    request,
    runtime,
    adminApiClient,
  }) => {
    const lead = Tradesman.aTradesman()
      .withRandomDetails()
      .withWebsites(["https://example.com"])
      .withDocs(0)
      .withWorkPhotos(0)
      .withOffer({ discountMin: 0, discountMax: 0, warranty: "none" })
      .withLikesCount(0)
      .withWinsCount(0);

    const joinRes = await request.post(
      `${runtime.apiBaseUrl}/api/tradesmen/join`,
      {
        data: lead.toJoinPayload(),
      },
    );
    expect(joinRes.status()).toBe(201);

    const joinBody = await joinRes.json();
    const leadId = joinBody.id as string;

    const targetUid = uniq("tm-real");
    const targetClient = await authedApiForUid(
      request,
      runtime.apiBaseUrl,
      targetUid,
    );
    await targetClient.post("/api/account", { username: uniq("u") });

    const promoteRes = await adminApiClient.post(
      `/api/admin/tradesmen/${leadId}/status`,
      { status: "active", assignTo: targetUid },
    );
    expect(promoteRes.status()).toBe(200);

    const inactiveRes = await adminApiClient.post(
      `/api/admin/tradesmen/${targetUid}/status`,
      { status: "inactive" },
    );
    expect(inactiveRes.status()).toBe(200);

    const body = await inactiveRes.json();
    expect(body.ok).toBe(true);
    expect(body.promoted).toBe(false);

    expect(body.tradesman).toBeTruthy();
    expect(body.tradesman.user_id).toBe(targetUid);
    expect(String(body.tradesman.status || "").toLowerCase()).toBe("inactive");
  });

  test("admin can set a real tradesman back to draft (verification resets to unverified)", async ({
    request,
    runtime,
    adminApiClient,
  }) => {
    const lead = Tradesman.aTradesman()
      .withRandomDetails()
      .withWebsites(["https://example.com"])
      .withDocs(0)
      .withWorkPhotos(0)
      .withOffer({ discountMin: 0, discountMax: 0, warranty: "none" })
      .withLikesCount(0)
      .withWinsCount(0);

    const joinRes = await request.post(
      `${runtime.apiBaseUrl}/api/tradesmen/join`,
      {
        data: lead.toJoinPayload(),
      },
    );
    expect(joinRes.status()).toBe(201);

    const joinBody = await joinRes.json();
    const leadId = joinBody.id as string;

    const targetUid = uniq("tm-real");
    const targetClient = await authedApiForUid(
      request,
      runtime.apiBaseUrl,
      targetUid,
    );
    await targetClient.post("/api/account", { username: uniq("u") });

    const promoteRes = await adminApiClient.post(
      `/api/admin/tradesmen/${leadId}/status`,
      { status: "active", assignTo: targetUid },
    );
    expect(promoteRes.status()).toBe(200);

    const draftRes = await adminApiClient.post(
      `/api/admin/tradesmen/${targetUid}/status`,
      { status: "draft" },
    );
    expect(draftRes.status()).toBe(200);

    const body = await draftRes.json();
    expect(body.ok).toBe(true);
    expect(body.promoted).toBe(false);

    expect(body.tradesman).toBeTruthy();
    expect(body.tradesman.user_id).toBe(targetUid);
    expect(String(body.tradesman.status || "").toLowerCase()).toBe("draft");
    expect(String(body.tradesman.verification_status || "").toLowerCase()).toBe(
      "unverified",
    );
  });

  test("400 when activating a lead_* without assignTo", async ({
    request,
    runtime,
    adminApiClient,
  }) => {
    const lead = Tradesman.aTradesman()
      .withRandomDetails()
      .withWebsites(["https://example.com"])
      .withDocs(0)
      .withWorkPhotos(0)
      .withOffer({ discountMin: 0, discountMax: 0, warranty: "none" })
      .withLikesCount(0)
      .withWinsCount(0);

    const joinRes = await request.post(
      `${runtime.apiBaseUrl}/api/tradesmen/join`,
      {
        data: lead.toJoinPayload(),
      },
    );
    expect(joinRes.status()).toBe(201);

    const joinBody = await joinRes.json();
    const leadId = joinBody.id as string;

    const res = await adminApiClient.post(
      `/api/admin/tradesmen/${leadId}/status`,
      { status: "active" },
    );

    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("ASSIGN_UID_REQUIRED");
  });

  test("400 invalid status", async ({ request, runtime, adminApiClient }) => {
    const lead = Tradesman.aTradesman()
      .withRandomDetails()
      .withWebsites(["https://example.com"])
      .withDocs(0)
      .withWorkPhotos(0)
      .withOffer({ discountMin: 0, discountMax: 0, warranty: "none" })
      .withLikesCount(0)
      .withWinsCount(0);

    const joinRes = await request.post(
      `${runtime.apiBaseUrl}/api/tradesmen/join`,
      {
        data: lead.toJoinPayload(),
      },
    );
    expect(joinRes.status()).toBe(201);

    const joinBody = await joinRes.json();
    const leadId = joinBody.id as string;

    const res = await adminApiClient.post(
      `/api/admin/tradesmen/${leadId}/status`,
      { status: "banana" },
    );

    expect(res.status()).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid status" });
  });

  test("404 tradesman not found", async ({ adminApiClient }) => {
    const missingUid = uniq("lead-missing");

    const res = await adminApiClient.post(
      `/api/admin/tradesmen/${missingUid}/status`,
      { status: "active", assignTo: "some-uid" },
    );

    expect(res.status()).toBe(404);
    expect(await res.json()).toEqual({ error: "tradesman not found" });
  });

  test("401 unauthenticated", async ({ request, runtime }) => {
    const res = await request.post(
      `${runtime.apiBaseUrl}/api/admin/tradesmen/lead_x/status`,
      { data: { status: "active", assignTo: "any" } },
    );

    expect(res.status()).toBe(401);
  });

  test("non-admin user is blocked (403 returned)", async ({
    request,
    runtime,
  }) => {
    const uid = uniq("nonadmin");
    const nonAdmin = await authedApiForUid(request, runtime.apiBaseUrl, uid);

    const res = await nonAdmin.post(`/api/admin/tradesmen/lead_x/status`, {
      status: "active",
      assignTo: "any",
    });

    expect(res.status()).toBe(403);
  });

  test("GET is not allowed (404 returned)", async ({
    request,
    runtime,
  }) => {
    const res = await request.get(
      `${runtime.apiBaseUrl}/api/admin/tradesmen/lead_x/status`,
    );
    expect(res.status()).toBe(404);
  });
});
