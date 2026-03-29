import { test, expect } from "../../../src/fixtures";
import {
  authedApiForUid,
  getUidFromJoinResponse,
} from "../../../src/api/services/client";

test.describe("POST /api/admin/tradesmen/:uid/status", () => {
  test("Returns 401 when no user is signed in", async ({
    request,
    runtime,
  }) => {
    const res = await request.post(
      `${runtime.apiBaseUrl}/api/admin/tradesmen/some-uid/status`,
      { data: { status: "active" } },
    );
    expect(res.status()).toBe(401);
  });

  test("Returns 403 when a non-admin user attempts the update", async ({
    request,
    runtime,
  }) => {
    const nonAdminUid = `user-${Date.now()}`;
    const client = await authedApiForUid(
      request,
      runtime.apiBaseUrl,
      nonAdminUid,
    );
    const res = await client.post(`/api/admin/tradesmen/some-uid/status`, {
      status: "active",
    });
    expect(res.status()).toBe(403);
  });

  test("Returns 404 when the tradesman does not exist", async ({
    adminApiClient,
  }) => {
    const missingUid = `missing-${Date.now()}`;
    const res = await adminApiClient.post(
      `/api/admin/tradesmen/${missingUid}/status`,
      { status: "active" },
    );
    expect(res.status()).toBe(404);
    expect(await res.json()).toEqual({ error: "tradesman not found" });
  });

  test("Returns 400 for an unrecognised status value", async ({
    adminApiClient,
  }) => {
    const joinRes = await adminApiClient.joinTradesmanDraft();
    expect(joinRes.status()).toBe(201);
    const uid = await getUidFromJoinResponse(joinRes);

    const res = await adminApiClient.post(
      `/api/admin/tradesmen/${uid}/status`,
      { status: "published" },
    );
    expect(res.status()).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid status" });
  });

  test("Sets a lead tradesman to inactive without promoting it", async ({
    adminApiClient,
  }) => {
    const joinRes = await adminApiClient.joinTradesmanDraft();
    expect(joinRes.status()).toBe(201);
    const uid = await getUidFromJoinResponse(joinRes);

    const res = await adminApiClient.post(
      `/api/admin/tradesmen/${uid}/status`,
      { status: "inactive" },
    );
    expect(res.status()).toBe(200);

    const body: any = await res.json();
    expect(body.ok).toBe(true);
    expect(body.promoted).toBe(false);
    expect(body.tradesman.status).toBe("inactive");
    expect(body.tradesman.user_id).toBe(uid);
  });

  test("Sets a lead tradesman back to draft and resets verification_status to 'unverified'", async ({
    adminApiClient,
  }) => {
    const joinRes = await adminApiClient.joinTradesmanDraft();
    expect(joinRes.status()).toBe(201);
    const uid = await getUidFromJoinResponse(joinRes);

    // First move to inactive
    await adminApiClient.post(`/api/admin/tradesmen/${uid}/status`, {
      status: "inactive",
    });

    // Then reset to draft
    const res = await adminApiClient.post(
      `/api/admin/tradesmen/${uid}/status`,
      { status: "draft" },
    );
    expect(res.status()).toBe(200);

    const body: any = await res.json();
    expect(body.ok).toBe(true);
    expect(body.promoted).toBe(false);
    expect(body.tradesman.status).toBe("draft");
    expect(body.tradesman.verification_status).toBe("unverified");
  });

  test("Returns 400 when activating a lead with no matching real user (no assignTo)", async ({
    adminApiClient,
  }) => {
    // Use a unique email that has no corresponding users row
    const uniqueEmail = `no-match-${Date.now()}@example.test`;
    const joinRes = await adminApiClient.joinTradesmanDraft({
      email: uniqueEmail,
    });
    expect(joinRes.status()).toBe(201);
    const uid = await getUidFromJoinResponse(joinRes);

    const res = await adminApiClient.post(
      `/api/admin/tradesmen/${uid}/status`,
      { status: "active" },
    );
    expect(res.status()).toBe(400);

    const body: any = await res.json();
    expect(body.error).toMatch(/assignTo/i);
  });

  test("Activating a real-UID tradesman sets verification_status to 'approved'", async ({
    request,
    runtime,
    adminApiClient,
  }) => {
    // Create a real user and sign up
    const builderUid = `builder-${Date.now()}`;
    const builderClient = await authedApiForUid(
      request,
      runtime.apiBaseUrl,
      builderUid,
    );
    await builderClient.post("/api/auth/signup", {
      firstName: "Builder",
      lastName: "Test",
      location: "E1",
    });

    // Create a lead and promote it to the real UID via assignTo
    const joinRes = await adminApiClient.joinTradesmanDraft({
      companyName: `Promote Co ${Date.now()}`,
    });
    expect(joinRes.status()).toBe(201);
    const leadUid = await getUidFromJoinResponse(joinRes);

    const promoteRes = await adminApiClient.post(
      `/api/admin/tradesmen/${leadUid}/status`,
      { status: "active", assignTo: builderUid },
    );
    expect(promoteRes.status()).toBe(200);

    const promoteBody: any = await promoteRes.json();
    expect(promoteBody.ok).toBe(true);
    expect(promoteBody.promoted).toBe(true);

    // Now deactivate the real-UID tradesman
    const deactivateRes = await adminApiClient.post(
      `/api/admin/tradesmen/${builderUid}/status`,
      { status: "inactive" },
    );
    expect(deactivateRes.status()).toBe(200);

    const deactivateBody: any = await deactivateRes.json();
    expect(deactivateBody.tradesman.status).toBe("inactive");

    // Re-activate: verification_status should become 'approved'
    const reactivateRes = await adminApiClient.post(
      `/api/admin/tradesmen/${builderUid}/status`,
      { status: "active" },
    );
    expect(reactivateRes.status()).toBe(200);

    const reactivateBody: any = await reactivateRes.json();
    expect(reactivateBody.tradesman.status).toBe("active");
    expect(reactivateBody.tradesman.verification_status).toBe("approved");
    expect(reactivateBody.promoted).toBe(false);
  });

  test("Setting a real-UID tradesman to draft resets verification_status to 'unverified'", async ({
    request,
    runtime,
    adminApiClient,
  }) => {
    const builderUid = `builder-draft-${Date.now()}`;
    const builderClient = await authedApiForUid(
      request,
      runtime.apiBaseUrl,
      builderUid,
    );
    await builderClient.post("/api/auth/signup", {
      firstName: "Builder",
      lastName: "Draft",
      location: "E1",
    });

    // Promote a lead to the real UID
    const joinRes = await adminApiClient.joinTradesmanDraft({
      companyName: `Draft Verify Co ${Date.now()}`,
    });
    expect(joinRes.status()).toBe(201);
    const leadUid = await getUidFromJoinResponse(joinRes);

    await adminApiClient.post(`/api/admin/tradesmen/${leadUid}/status`, {
      status: "active",
      assignTo: builderUid,
    });

    // Set back to draft
    const draftRes = await adminApiClient.post(
      `/api/admin/tradesmen/${builderUid}/status`,
      { status: "draft" },
    );
    expect(draftRes.status()).toBe(200);

    const draftBody: any = await draftRes.json();
    expect(draftBody.tradesman.status).toBe("draft");
    expect(draftBody.tradesman.verification_status).toBe("unverified");
  });
});
