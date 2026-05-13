// server/routes/__test__/swipe-matching.js
//
// Test-only helpers for the swipe-matching e2e suite. Each route is gated
// by assertTestAccess (X-Test-Secret header + ENABLE_TEST_ROUTES=1).
//
// These exist because the corresponding rows are normally written as a
// side effect of async pipelines (AI classification, recommendation→
// tradesman match, mutual swipe). Driving the full pipeline in every
// spec would be slow and flaky; these endpoints let tests pin the
// end-state explicitly.

module.exports = (router, ctx) => {
  const { assertTestAccess, mysqlQuery } = ctx;
  if (!mysqlQuery) throw new Error("mysqlQuery not attached to ctx");

  /**
   * POST /api/__test__/recommendations/link-tradesman
   * Body: { projectId, tradesmanUid, recommenderUid?, company }
   * Inserts a 'platform' recommendation already linked to an on-platform
   * tradesperson, mirroring the end-state of the rec→tradesman matcher.
   */
  router.post("/__test__/recommendations/link-tradesman", async (req, res) => {
    const ok = assertTestAccess(req, res);
    if (ok !== true) return;

    const { projectId, tradesmanUid, recommenderUid, company } = req.body || {};
    if (!projectId || !tradesmanUid || !company) {
      return res
        .status(400)
        .json({ error: "projectId, tradesmanUid, company are required" });
    }

    try {
      const result = await mysqlQuery(
        `INSERT INTO recommendations
           (projectId, recommenderUserId, createdAt, name, company, rating,
            comment, isAnonymous, source, linked_tradesman_uid)
         VALUES (?, ?, NOW(), 'Jane Doe', ?, 5,
                 'Great work', 0, 'platform', ?)`,
        [projectId, recommenderUid ?? null, company, tradesmanUid],
      );
      return res
        .status(201)
        .json({ ok: true, recommendationId: result.insertId });
    } catch (e) {
      console.error("[__test__/recommendations/link-tradesman] error", e);
      return res.status(500).json({ error: "insert failed" });
    }
  });

  /**
   * POST /api/__test__/project-classifications
   * Body: { projectId, recommendedTrades: string[] }
   * Seeds the project_classifications row that the swipe deck reads for
   * the trade-match path.
   */
  router.post("/__test__/project-classifications", async (req, res) => {
    const ok = assertTestAccess(req, res);
    if (ok !== true) return;

    const { projectId, recommendedTrades } = req.body || {};
    if (!projectId || !Array.isArray(recommendedTrades)) {
      return res
        .status(400)
        .json({ error: "projectId and recommendedTrades[] are required" });
    }

    try {
      await mysqlQuery(
        `INSERT INTO project_classifications
           (project_id, classifier_version, raw_description, structured,
            cost_pence, latency_ms)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          projectId,
          "e2e-test",
          "seeded for swipe-matching smoke test",
          JSON.stringify({ recommended_trades: recommendedTrades }),
          0,
          0,
        ],
      );
      return res.status(201).json({ ok: true });
    } catch (e) {
      console.error("[__test__/project-classifications] error", e);
      return res.status(500).json({ error: "insert failed" });
    }
  });

  /**
   * POST /api/__test__/swipe-interest
   * Body: {
   *   projectId, homeownerUid, builderUid,
   *   source?: 'recommended' | 'subscribed' | 'paid_unlock',  // default 'recommended'
   *   status?: 'pending' | 'matched' | 'declined_by_homeowner'
   *          | 'declined_by_builder' | 'expired',             // default 'matched'
   * }
   * Pins a swipe_interest row to a chosen status without driving the full
   * mutual-swipe flow.
   */
  router.post("/__test__/swipe-interest", async (req, res) => {
    const ok = assertTestAccess(req, res);
    if (ok !== true) return;

    const {
      projectId,
      homeownerUid,
      builderUid,
      source = "recommended",
      status = "matched",
    } = req.body || {};
    if (!projectId || !homeownerUid || !builderUid) {
      return res.status(400).json({
        error: "projectId, homeownerUid, builderUid are required",
      });
    }

    try {
      const result = await mysqlQuery(
        `INSERT INTO swipe_interest
           (project_id, homeowner_uid, builder_uid, source, status,
            homeowner_swiped_at, builder_swiped_at)
         VALUES (?, ?, ?, ?, ?, NOW(), NOW())`,
        [projectId, homeownerUid, builderUid, source, status],
      );
      return res.status(201).json({ ok: true, id: result.insertId });
    } catch (e) {
      console.error("[__test__/swipe-interest POST] error", e);
      return res.status(500).json({ error: "insert failed" });
    }
  });

  /**
   * POST /api/__test__/project-closures
   * Body: {
   *   projectId, winnerTradesmanUid,
   *   boostConsent?: boolean,        // default true
   *   photoPaths?: string[],         // closure photos
   * }
   * Seeds a boosted-closure history row so the tradesperson surfaces as
   * a "Top tradesperson" with a "Recently completed in {area}" band.
   */
  router.post("/__test__/project-closures", async (req, res) => {
    const ok = assertTestAccess(req, res);
    if (ok !== true) return;

    const {
      projectId,
      winnerTradesmanUid,
      boostConsent = true,
      photoPaths = [],
    } = req.body || {};
    if (!projectId || !winnerTradesmanUid) {
      return res.status(400).json({
        error: "projectId and winnerTradesmanUid are required",
      });
    }

    try {
      const result = await mysqlQuery(
        `INSERT INTO project_closures
           (projectId, didGoAhead, reasons, winner_tradesman_uid,
            boost_consent, createdAt)
         VALUES (?, 1, '[]', ?, ?, NOW())
         ON DUPLICATE KEY UPDATE
           winner_tradesman_uid = VALUES(winner_tradesman_uid),
           boost_consent = VALUES(boost_consent),
           didGoAhead = VALUES(didGoAhead)`,
        [projectId, winnerTradesmanUid, boostConsent ? 1 : 0],
      );

      if (Array.isArray(photoPaths) && photoPaths.length > 0) {
        for (const p of photoPaths) {
          await mysqlQuery(
            `INSERT INTO project_closure_photos
               (projectId, filePath, createdAt)
             VALUES (?, ?, NOW())`,
            [projectId, String(p)],
          );
        }
      }

      return res
        .status(201)
        .json({ ok: true, closureId: result.insertId ?? null });
    } catch (e) {
      console.error("[__test__/project-closures] error", e);
      return res.status(500).json({ error: "insert failed" });
    }
  });

  /**
   * GET /api/__test__/swipe-interest?projectId=X&builderUid=Y
   * Used by waitForSwipeInterest polling. Returns { row: { id, status } | null }.
   */
  router.get("/__test__/swipe-interest", async (req, res) => {
    const ok = assertTestAccess(req, res);
    if (ok !== true) return;

    const projectId = Number(req.query.projectId);
    const builderUid = String(req.query.builderUid || "");
    if (!Number.isFinite(projectId) || !builderUid) {
      return res
        .status(400)
        .json({ error: "projectId and builderUid required" });
    }

    try {
      const rows = await mysqlQuery(
        `SELECT id, status FROM swipe_interest
           WHERE project_id = ? AND builder_uid = ?
           LIMIT 1`,
        [projectId, builderUid],
      );
      const row = rows?.[0];
      if (!row) return res.status(200).json({ row: null });
      return res
        .status(200)
        .json({ row: { id: Number(row.id), status: String(row.status) } });
    } catch (e) {
      console.error("[__test__/swipe-interest GET] error", e);
      return res.status(500).json({ error: "query failed" });
    }
  });
};
