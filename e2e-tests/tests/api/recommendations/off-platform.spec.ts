import { test, expect } from "../../../src/fixtures";
import Project from "../../../src/models/Project";
import Recommendation from "../../../src/models/Recommendation";
import Tradesman from "../../../src/models/tradesman";
import { setupTradesmanProfile } from "../../../src/apiHelper/tradesman/setupTradesmanProfile";
import { connect } from "../../../src/db/mysql";

test.describe("Off-platform recommendations", () => {
  test("off-platform rec surfaces in /off-platform-recommendations and links on builder signup", async ({
    request,
    runtime,
    projectApi,
    projectRecommendationApi,
    adminApi,
  }) => {
    const offPlatformCompany = `Off Platform Builder ${Date.now()} Ltd`;
    const builderEmail = `e2e-builder-${Date.now()}@example.com`;

    const project = await projectApi.createLiveProject(
      Project.aProject().withRandomDetails().toApiPayload(),
    );

    const created = await projectRecommendationApi.createRecommendation(
      project.id,
      Recommendation.aRecommendation()
        .withRandomDetails()
        .withCompany(offPlatformCompany)
        .withCompanyEmail(builderEmail)
        .toPayload(),
    );
    expect(created.recommendationId).toBeTruthy();

    // Rec should appear in off-platform-recommendations (no linked tradesman yet)
    const before = await projectApi.getOffPlatformRecommendations(project.id);
    expect(Array.isArray(before.items)).toBe(true);
    const rec = (before.items as any[]).find(
      (r: any) => r.company === offPlatformCompany,
    );
    expect(rec, "rec should appear in off-platform list").toBeDefined();
    // invite.sentToEmail is set only when RESEND_API_KEY is present and the
    // INSERT in sendBuilderInviteEmail runs. Assert the shape is present but
    // don't require a specific value here — the key field is invite.sent.
    expect(rec.invite).toBeDefined();

    // offPlatformRecCount should be > 0 and the company should NOT be in
    // recommended (no linked tradesman yet)
    const matchesBefore = await projectApi.getMatches(project.id);
    expect(matchesBefore.offPlatformRecCount).toBeGreaterThan(0);
    expect(
      (matchesBefore.recommended ?? []).find(
        (b: any) => b.companyName === offPlatformCompany,
      ),
    ).toBeUndefined();

    // A new tradesman signs up with the SAME company name
    const { uid: builderUid } = await setupTradesmanProfile({
      request,
      apiBaseUrl: runtime.apiBaseUrl,
      tradesman: Tradesman.aTradesman()
        .withRandomDetails()
        .withCompanyName(offPlatformCompany),
    });

    // claimPipelineEntry runs fire-and-forget on PUT /api/tradesmen/me.
    // The tradesman must be active for the rec to surface in /matches.
    await adminApi.setTradesmanStatus(builderUid, "active");

    // Poll until the rec disappears from the off-platform list (linking is async)
    await expect
      .poll(
        async () => {
          const after = await projectApi.getOffPlatformRecommendations(
            project.id,
          );
          return (after.items as any[]).find(
            (r: any) => r.company === offPlatformCompany,
          );
        },
        { timeout: 10_000, intervals: [500] },
      )
      .toBeUndefined();

    // Rec should now appear in /matches recommended list
    const matchesAfter = await projectApi.getMatches(project.id);
    const linkedBuilder = (matchesAfter.recommended ?? []).find(
      (b: any) => b.companyName === offPlatformCompany,
    );
    expect(
      linkedBuilder,
      "linked builder should appear in recommended matches",
    ).toBeDefined();
  });

  test("nudge endpoint enforces 24h cooldown", async ({
    projectApi,
    projectRecommendationApi,
    runtime,
  }) => {
    const project = await projectApi.createLiveProject(
      Project.aProject().withRandomDetails().toApiPayload(),
    );

    const created = await projectRecommendationApi.createRecommendation(
      project.id,
      Recommendation.aRecommendation()
        .withRandomDetails()
        .withCompany(`Nudge Test ${Date.now()}`)
        .withCompanyEmail(`nudge-${Date.now()}@example.com`)
        .toPayload(),
    );
    const recommendationId: number =
      created.recommendationId ?? created.id;
    expect(recommendationId).toBeTruthy();

    // Insert (or upsert) a recommendation_invites row with lastNudgedAt = NOW()
    // so the nudge endpoint immediately sees the cooldown without needing to
    // actually send an email (which would require a live Resend API key).
    const conn = await connect({
      host: process.env.TEST_DB_HOST || "localhost",
      port: Number(process.env.TEST_DB_PORT || 3306),
      user: process.env.TEST_DB_USER || "root",
      password: process.env.TEST_DB_PASSWORD || "",
      database: runtime.dbName,
    });

    try {
      await conn.query(
        `INSERT INTO recommendation_invites
           (recommendationId, sentToEmail, emailSentAt, lastNudgedAt, createdAt)
         VALUES (?, ?, NOW(), NOW(), NOW())
         ON DUPLICATE KEY UPDATE lastNudgedAt = NOW()`,
        [recommendationId, "nudge-seeded@example.com"],
      );
    } finally {
      await conn.end();
    }

    // First nudge: lastNudgedAt is NOW(), so cooldown kicks in immediately → 429
    const response = await projectApi.nudgeRecommendation(recommendationId);
    expect(response.status()).toBe(429);
  });
});
