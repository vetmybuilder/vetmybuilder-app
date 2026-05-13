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
   * Body: {
   *   projectId, tradesmanUid, company,
   *   recommenderUid?,           // existing user uid
   *   recommenderFirstName?,     // when set, creates a fresh recommender
   *                              // user with this firstName so the deck
   *                              // shows "Recommended by <firstName>"
   * }
   * Inserts a 'platform' recommendation already linked to an on-platform
   * tradesperson, mirroring the end-state of the rec→tradesman matcher.
   * Returns { recommendationId, recommenderUid } so the caller can refer
   * to the (possibly fresh) recommender uid in later assertions.
   */
  router.post("/__test__/recommendations/link-tradesman", async (req, res) => {
    const ok = assertTestAccess(req, res);
    if (ok !== true) return;

    const {
      projectId,
      tradesmanUid,
      recommenderUid,
      recommenderFirstName,
      company,
    } = req.body || {};
    if (!projectId || !tradesmanUid || !company) {
      return res
        .status(400)
        .json({ error: "projectId, tradesmanUid, company are required" });
    }

    try {
      let resolvedRecommenderUid = recommenderUid ?? null;

      if (recommenderFirstName) {
        if (!resolvedRecommenderUid) {
          resolvedRecommenderUid = `rec-${Date.now()}-${Math.random()
            .toString(16)
            .slice(2, 8)}`;
        }
        await mysqlQuery(
          `INSERT INTO users (uid, email, createdAt, firstName)
           VALUES (?, ?, NOW(), ?)
           ON DUPLICATE KEY UPDATE firstName = VALUES(firstName)`,
          [
            resolvedRecommenderUid,
            `${resolvedRecommenderUid}@test.local`,
            String(recommenderFirstName),
          ],
        );
      }

      const result = await mysqlQuery(
        `INSERT INTO recommendations
           (projectId, recommenderUserId, createdAt, name, company, rating,
            comment, isAnonymous, source, linked_tradesman_uid)
         VALUES (?, ?, NOW(), 'Jane Doe', ?, 5,
                 'Great work', 0, 'platform', ?)`,
        [projectId, resolvedRecommenderUid, company, tradesmanUid],
      );
      return res.status(201).json({
        ok: true,
        recommendationId: result.insertId,
        recommenderUid: resolvedRecommenderUid,
      });
    } catch (e) {
      console.error("[__test__/recommendations/link-tradesman] error", e);
      return res.status(500).json({ error: "insert failed" });
    }
  });

  /**
   * POST /api/__test__/project-classifications
   * Body: {
   *   projectId,
   *   recommendedTrades: string[],
   *   aiSummary?: string,        // -> structured.summary, read by JobCardBack
   *   keyConcerns?: string[],    // -> structured.key_concerns
   * }
   * Seeds the project_classifications row the swipe deck reads. Extended
   * with the AI fields jobs.get.js surfaces on the tradesman deck (so
   * tests can assert summary / key-concerns rendering without running the
   * real classifier).
   */
  router.post("/__test__/project-classifications", async (req, res) => {
    const ok = assertTestAccess(req, res);
    if (ok !== true) return;

    const { projectId, recommendedTrades, aiSummary, keyConcerns } =
      req.body || {};
    if (!projectId || !Array.isArray(recommendedTrades)) {
      return res
        .status(400)
        .json({ error: "projectId and recommendedTrades[] are required" });
    }

    const structured = {
      recommended_trades: recommendedTrades,
      ...(aiSummary ? { summary: String(aiSummary) } : {}),
      ...(Array.isArray(keyConcerns) ? { key_concerns: keyConcerns } : {}),
    };

    try {
      // jobs.get reads the LATEST classification per project
      // (ORDER BY classified_at DESC). Project create/update fires the
      // real classifier fire-and-forget; that async write can land
      // BEFORE or AFTER this test seed depending on stub latency.
      // Stamp the seed row with a far-future classified_at so it wins
      // the ordering deterministically regardless of timing.
      await mysqlQuery(
        `DELETE FROM project_classifications WHERE project_id = ?`,
        [projectId],
      );
      await mysqlQuery(
        `INSERT INTO project_classifications
           (project_id, classifier_version, raw_description, structured,
            cost_pence, latency_ms, classified_at)
         VALUES (?, ?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL 1 YEAR))`,
        [
          projectId,
          "e2e-test",
          "seeded for swipe-matching smoke test",
          JSON.stringify(structured),
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
   * POST /api/__test__/tradesmen-stats
   * Body: {
   *   tradesmanUid,
   *   googleRating?: number,           // -> tradesmen.google_rating
   *   googleReviewsCount?: number,     // -> tradesmen.google_reviews_count
   *   chStatus?: string,               // -> tradesmen.ch_status ('verified' shows badge)
   *   yearsTrading?: number,           // backdates tradesmen.created_at by N years
   * }
   * Stat fields the BuilderCard / JobCard rely on. Production exposes
   * these through scraped Google reviews + Companies House verification,
   * neither of which we run in e2e - so set them directly.
   */
  router.post("/__test__/tradesmen-stats", async (req, res) => {
    const ok = assertTestAccess(req, res);
    if (ok !== true) return;

    const {
      tradesmanUid,
      googleRating,
      googleReviewsCount,
      chStatus,
      yearsTrading,
    } = req.body || {};
    if (!tradesmanUid) {
      return res.status(400).json({ error: "tradesmanUid is required" });
    }

    const updates = [];
    const params = [];
    if (googleRating != null) {
      updates.push("google_rating = ?");
      params.push(Number(googleRating));
    }
    if (googleReviewsCount != null) {
      updates.push("google_reviews_count = ?");
      params.push(Number(googleReviewsCount));
    }
    if (chStatus != null) {
      updates.push("ch_status = ?");
      params.push(String(chStatus));
    }
    if (yearsTrading != null) {
      updates.push("created_at = DATE_SUB(NOW(), INTERVAL ? YEAR)");
      params.push(Number(yearsTrading));
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: "no fields to update" });
    }

    params.push(tradesmanUid);

    try {
      await mysqlQuery(
        `UPDATE tradesmen SET ${updates.join(", ")} WHERE user_id = ?`,
        params,
      );
      return res.status(200).json({ ok: true });
    } catch (e) {
      console.error("[__test__/tradesmen-stats] error", e);
      return res.status(500).json({ error: "update failed" });
    }
  });

  /**
   * POST /api/__test__/users
   * (Already exists in __test__/users.post.js for general user seeding.)
   * For incoming-lead surface tests we need to ensure a homeowner uid
   * resolves to a known firstName, so the rec→deck pipeline surfaces
   * "Recommended by Alex" - that uses /__test__/users which is already
   * wired in buildRouter.
   */

  /**
   * POST /api/__test__/swipe-interest
   * Body: {
   *   projectId, homeownerUid, builderUid,
   *   source?: 'recommended' | 'subscribed' | 'paid_unlock',  // default 'recommended'
   *   status?: 'pending' | 'matched' | 'declined_by_homeowner'
   *          | 'declined_by_builder' | 'expired',             // default 'matched'
   *   homeownerSwiped?: boolean,    // default true - sets homeowner_swiped_at
   *   builderSwiped?: boolean,      // default true - sets builder_swiped_at
   * }
   * Pins a swipe_interest row to a chosen status without driving the full
   * mutual-swipe flow. The two `*Swiped` flags let callers seed
   * "homeowner picked you, awaiting builder" (status=pending,
   * homeownerSwiped=true, builderSwiped=false) for incoming-lead tests.
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
      homeownerSwiped = true,
      builderSwiped = true,
    } = req.body || {};
    if (!projectId || !homeownerUid || !builderUid) {
      return res.status(400).json({
        error: "projectId, homeownerUid, builderUid are required",
      });
    }

    const homeownerAt = homeownerSwiped ? "NOW()" : "NULL";
    const builderAt = builderSwiped ? "NOW()" : "NULL";

    try {
      const result = await mysqlQuery(
        `INSERT INTO swipe_interest
           (project_id, homeowner_uid, builder_uid, source, status,
            homeowner_swiped_at, builder_swiped_at)
         VALUES (?, ?, ?, ?, ?, ${homeownerAt}, ${builderAt})`,
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
