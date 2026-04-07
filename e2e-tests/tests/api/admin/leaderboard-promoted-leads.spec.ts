// Locks in the always-on filter on /api/tradesmen/leaderboard that hides
// the audit-shadow `lead_*` rows left behind by the admin promotion flow.
//
// Background: POST /api/admin/tradesmen/:id/status (the promotion endpoint)
// keeps the original lead row around as an audit shadow — marking it as
// draft/unverified — and creates a new active row keyed on the real
// Firebase uid. We don't want both rows on the admin leaderboard, so the
// leaderboard query excludes any lead row whose email matches a non-lead
// row's email.

import { test, expect } from "../../../src/fixtures";

test.describe("GET /api/tradesmen/leaderboard — promoted-lead audit shadows", () => {
  test("returns only the promoted active row, not the lead audit shadow", async ({
    apiClient,
    adminApi,
  }) => {
    const stamp = Date.now();
    const company = `Promoted Co ${stamp}`;
    const email = `promoted+${stamp}@example.test`;
    const realUid = `tm-promoted-${stamp}`;

    const joinRes = await apiClient.joinTradesmanDraft({
      companyName: company,
      email,
    });
    expect(joinRes.status()).toBe(201);
    const leadId = (await joinRes.json()).id;

    await adminApi.setTradesmanStatus(leadId, "active", realUid);

    // Both the lead audit shadow AND the promoted active row now exist
    // in the DB. The leaderboard should show only the promoted active row.
    await adminApi.expectSingleLeaderboardRowForCompany(company, {
      userId: realUid,
    });
  });

  test("a lead that has NOT been promoted is still visible", async ({
    apiClient,
    adminApi,
  }) => {
    const stamp = Date.now();
    const company = `Pending Lead Co ${stamp}`;
    const email = `pending-lead+${stamp}@example.test`;

    const joinRes = await apiClient.joinTradesmanDraft({
      companyName: company,
      email,
    });
    expect(joinRes.status()).toBe(201);
    const leadId = (await joinRes.json()).id;

    // No promotion — the admin should still see this lead so they can
    // triage it. The single-row check confirms we didn't accidentally
    // hide all leads when adding the audit-shadow filter.
    await adminApi.expectSingleLeaderboardRowForCompany(company, {
      userId: leadId,
    });
  });
});
