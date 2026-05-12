// tests/server/adminAuditLog.spec.ts
//
// The logAdminAction helper has three contracts that matter:
//   - It inserts the row into admin_audit_log with JSON-encoded details.
//   - It silently no-ops on bad args so callers don't have to check.
//   - It swallows mysql errors so a failed audit insert never breaks
//     the mutation that called it.

import { describe, it, expect, vi } from "vitest";
import { logAdminAction } from "../../server/lib/adminAuditLog";

describe("logAdminAction", () => {
  it("inserts a row with JSON-encoded details", async () => {
    const mysqlQuery = vi.fn().mockResolvedValue({ insertId: 1 });
    await logAdminAction({
      mysqlQuery,
      actorUid: "admin-1",
      targetUid: "u-2",
      action: "status_change",
      details: { status: "inactive" },
    });

    expect(mysqlQuery).toHaveBeenCalledTimes(1);
    const [sql, params] = mysqlQuery.mock.calls[0];
    expect(sql).toMatch(/INSERT INTO admin_audit_log/);
    expect(params).toEqual([
      "admin-1",
      "u-2",
      "status_change",
      '{"status":"inactive"}',
    ]);
  });

  it("encodes null when no details are supplied", async () => {
    const mysqlQuery = vi.fn().mockResolvedValue({ insertId: 1 });
    await logAdminAction({
      mysqlQuery,
      actorUid: "admin-1",
      targetUid: "u-2",
      action: "sub_revoke",
    });

    const [, params] = mysqlQuery.mock.calls[0];
    expect(params[3]).toBeNull();
  });

  it("is a silent no-op when required args are missing", async () => {
    const mysqlQuery = vi.fn();
    await logAdminAction({
      mysqlQuery,
      actorUid: "",
      targetUid: "u-2",
      action: "status_change",
    });
    await logAdminAction({
      mysqlQuery,
      actorUid: "admin-1",
      targetUid: "",
      action: "status_change",
    });
    await logAdminAction({
      mysqlQuery,
      actorUid: "admin-1",
      targetUid: "u-2",
      action: "",
    });
    expect(mysqlQuery).not.toHaveBeenCalled();
  });

  it("swallows mysql errors instead of throwing", async () => {
    const mysqlQuery = vi.fn().mockRejectedValue(new Error("connection lost"));
    const log = { warn: vi.fn() };
    await expect(
      logAdminAction({
        mysqlQuery,
        actorUid: "admin-1",
        targetUid: "u-2",
        action: "status_change",
        log,
      }),
    ).resolves.toBeUndefined();
    // We DO want a warn log so the failure is observable.
    expect(log.warn).toHaveBeenCalled();
  });
});
