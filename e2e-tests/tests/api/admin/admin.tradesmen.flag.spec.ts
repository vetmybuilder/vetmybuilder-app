import { test, expect } from "../../../src/fixtures";
import {
  authedApiForUid,
  getUidFromJoinResponse,
} from "../../../src/api/services/client";

test.describe("Admin flags on tradesmen accounts", () => {
  test("Blocks access when no user is logged in (must be signed in as an admin)", async ({
    request,
    runtime,
  }) => {
    const uid = `tradesman-${Date.now()}`;

    const res = await request.post(
      `${runtime.apiBaseUrl}/api/admin/tradesmen/${uid}/flag`,
      {
        data: { reason: "test flag", severity: "warn" },
      },
    );

    expect(res.status()).toBe(401);
  });

  test("Blocks access when a normal user tries to flag a tradesman (admin only)", async ({
    request,
    runtime,
  }) => {
    const nonAdminUid = `user-${Date.now()}`;
    const client = await authedApiForUid(
      request,
      runtime.apiBaseUrl,
      nonAdminUid,
    );

    const res = await client.post(`/api/admin/tradesmen/${nonAdminUid}/flag`, {
      reason: "test flag",
      severity: "warn",
    });

    expect([401, 403]).toContain(res.status());
  });

  test("Returns 'not found' when the tradesman does not exist", async ({
    adminApiClient,
  }) => {
    await adminApiClient.get("/api/account");

    const missingUid = `missing-${Date.now()}`;

    const res = await adminApiClient.post(
      `/api/admin/tradesmen/${missingUid}/flag`,
      {
        reason: "test flag",
        severity: "warn",
      },
    );

    const body = await res.json();

    expect(res.status()).toBe(404);
    expect(body).toEqual({ error: "tradesman not found" });
  });

  test("Rejects the request when no reason is provided", async ({
    adminApiClient,
  }) => {
    const joinRes = await adminApiClient.joinTradesmanDraft();
    expect(joinRes.status()).toBe(201);
    const uid = await getUidFromJoinResponse(joinRes);

    const res = await adminApiClient.post(`/api/admin/tradesmen/${uid}/flag`, {
      reason: "   ",
      severity: "warn",
    });

    expect(res.status()).toBe(400);
    expect(await res.json()).toEqual({ error: "reason required" });
  });

  test("Defaults the severity level to 'warn' when it is not provided", async ({
    adminApiClient,
  }) => {
    const joinRes = await adminApiClient.joinTradesmanDraft();
    expect(joinRes.status()).toBe(201);
    const uid = await getUidFromJoinResponse(joinRes);

    const res = await adminApiClient.post(`/api/admin/tradesmen/${uid}/flag`, {
      reason: "missing severity should default",
    });

    expect(res.status()).toBe(201);

    const body: any = await res.json();
    expect(body.ok).toBe(true);
    expect(body.flag.user_id).toBe(uid);
    expect(body.flag.severity).toBe("warn");
  });

  test("Falls back to 'warn' when an invalid severity value is supplied", async ({
    adminApiClient,
  }) => {
    const joinRes = await adminApiClient.joinTradesmanDraft();
    expect(joinRes.status()).toBe(201);
    const uid = await getUidFromJoinResponse(joinRes);

    const res = await adminApiClient.post(`/api/admin/tradesmen/${uid}/flag`, {
      reason: "bad severity should be coerced",
      severity: "nope",
    });

    expect(res.status()).toBe(201);

    const body: any = await res.json();
    expect(body.flag.severity).toBe("warn");
  });

  test("Allows an admin to create an informational (info) flag", async ({
    adminApiClient,
  }) => {
    const joinRes = await adminApiClient.joinTradesmanDraft();
    expect(joinRes.status()).toBe(201);
    const uid = await getUidFromJoinResponse(joinRes);

    const res = await adminApiClient.post(`/api/admin/tradesmen/${uid}/flag`, {
      reason: "info flag",
      severity: "info",
    });

    expect(res.status()).toBe(201);

    const body: any = await res.json();
    expect(body.flag.severity).toBe("info");
  });

  test("Allows an admin to create a blocking (block) flag", async ({
    adminApiClient,
  }) => {
    const joinRes = await adminApiClient.joinTradesmanDraft();
    expect(joinRes.status()).toBe(201);
    const uid = await getUidFromJoinResponse(joinRes);

    const res = await adminApiClient.post(`/api/admin/tradesmen/${uid}/flag`, {
      reason: "block flag",
      severity: "block",
    });

    expect(res.status()).toBe(201);

    const body: any = await res.json();
    expect(body.flag.severity).toBe("block");
  });

  test("Trims extra spaces from the tradesman ID and reason before saving", async ({
    adminApiClient,
  }) => {
    const joinRes = await adminApiClient.joinTradesmanDraft();
    expect(joinRes.status()).toBe(201);
    const uid = await getUidFromJoinResponse(joinRes);

    const res = await adminApiClient.post(
      `/api/admin/tradesmen/${encodeURIComponent(`  ${uid}  `)}/flag`,
      {
        reason: "   needs trimming   ",
        severity: "warn",
      },
    );

    expect(res.status()).toBe(201);

    const body: any = await res.json();
    expect(body.flag.user_id).toBe(uid);
    expect(body.flag.reason).toBe("needs trimming");
  });

  test("Stores which admin created the flag (audit trail)", async ({
    adminApiClient,
  }) => {
    const joinRes = await adminApiClient.joinTradesmanDraft();
    expect(joinRes.status()).toBe(201);
    const uid = await getUidFromJoinResponse(joinRes);

    const res = await adminApiClient.post(`/api/admin/tradesmen/${uid}/flag`, {
      reason: "Audit trail check",
      severity: "warn",
    });

    expect(res.status()).toBe(201);

    const body: any = await res.json();
    expect(body.ok).toBe(true);

    expect(body.flag.created_by).toBeTruthy();
    expect(typeof body.flag.created_by).toBe("string");
    expect(body.flag.created_by.length).toBeGreaterThan(5);
  });

  test("Admin flag returns core flag fields on creation", async ({
    adminApiClient,
  }) => {
    const joinRes = await adminApiClient.joinTradesmanDraft();
    expect(joinRes.status()).toBe(201);
    const uid = await getUidFromJoinResponse(joinRes);

    const res = await adminApiClient.post(`/api/admin/tradesmen/${uid}/flag`, {
      reason: "Check returned fields",
    });

    expect(res.status()).toBe(201);

    const body: any = await res.json();
    const flag = body.flag;

    expect(flag.id).toBeTruthy();
    expect(typeof flag.id).toBe("number");
    expect(flag.user_id).toBe(uid);
    expect(flag.reason).toBe("Check returned fields");
    expect(flag.severity).toBe("warn");
    expect(flag.created_at).toBeTruthy();
    expect(flag.resolved_at).toBeNull();
  });

  test("Admin can create multiple flags for the same tradesman", async ({
    adminApiClient,
  }) => {
    const joinRes = await adminApiClient.joinTradesmanDraft();
    expect(joinRes.status()).toBe(201);
    const uid = await getUidFromJoinResponse(joinRes);

    const first = await adminApiClient.post(
      `/api/admin/tradesmen/${uid}/flag`,
      {
        reason: "First flag",
        severity: "info",
      },
    );
    expect(first.status()).toBe(201);

    const second = await adminApiClient.post(
      `/api/admin/tradesmen/${uid}/flag`,
      {
        reason: "Second flag",
        severity: "warn",
      },
    );
    expect(second.status()).toBe(201);

    const flag1 = (await first.json()).flag;
    const flag2 = (await second.json()).flag;

    expect(flag1.id).not.toBe(flag2.id);
    expect(flag1.reason).toBe("First flag");
    expect(flag2.reason).toBe("Second flag");
  });

  test("Rejects requests with a missing body safely (still returns 400)", async ({
    adminApiClient,
  }) => {
    const joinRes = await adminApiClient.joinTradesmanDraft();
    expect(joinRes.status()).toBe(201);
    const uid = await getUidFromJoinResponse(joinRes);

    const res = await adminApiClient.post(
      `/api/admin/tradesmen/${uid}/flag`,
      {},
    );
    expect(res.status()).toBe(400);
    expect(await res.json()).toEqual({ error: "reason required" });
  });
});
