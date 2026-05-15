// server/routes/projects/project-closure.get.js
//
// GET /api/projects/:id/closure
// Auth: required
//
// Visibility Rules:
//  - Owner can always view
//  - Non-owner may view ONLY IF:
//        • project.status === 'completed'
//        • AND they are in the same area (same logic as close.photos.get.js)
//
// Response:
//  {
//    projectId,
//    didGoAhead,
//    reasons,
//    otherReason,
//    winnerRecommendationId,
//    wouldUseAgain,
//    createdBy,
//    createdAt,
//    winner?: { id, company, name } | null
//  }

module.exports = (router, ctx) => {
  const { auth, mysqlQuery } = ctx;
  const { logger, withRequest } = require("../../lib/logger");
  const { extractLocationTokens } = require("../../lib/location");

  router.get("/projects/:id/closure", auth, async (req, res) => {
    const projectId = Number(req.params.id);
    const viewerUid = req.user?.uid;

    const log = withRequest(req, logger).child({
      route: "/projects/:id/closure",
      projectId,
      viewerUid,
    });

    // ------------------------------------------------------
    // Validate ID
    // ------------------------------------------------------
    if (!Number.isFinite(projectId)) {
      log.warn("Invalid project ID");
      return res.status(400).json({ error: "invalid_project_id" });
    }

    // ------------------------------------------------------
    // Load project
    // ------------------------------------------------------
    let project;
    try {
      const rows = await mysqlQuery(
        `
        SELECT 
          id,
          ownerUserId,
          status,
          location
        FROM projects
        WHERE id = ?
        `,
        [projectId]
      );
      project = rows[0] || null;
    } catch (err) {
      log.error({ err }, "Failed to load project");
      return res.status(500).json({ error: "internal_error" });
    }

    if (!project) {
      log.info("Project not found");
      return res.status(404).json({ error: "not_found" });
    }

    // ------------------------------------------------------
    // Visibility rules
    // ------------------------------------------------------
    let allow = false;

    // 1) Owner can always see
    if (viewerUid === project.ownerUserId) {
      allow = true;
    } else {
      // 2) Completed + same-area check.
      //
      // SECURITY: the previous implementation did a substring match between
      // project.location and any of the viewer's raw user fields (including
      // free-text city). That allowed trivial bypass - e.g. setting city to
      // "e" or "lo" matched virtually any UK postcode. We now require an
      // EXACT match on postcode_outward (e.g. "E4" == "E4") only, using the
      // shared extractLocationTokens helper, and ignore tokens < 2 chars.
      if (project.status === "completed") {
        try {
          const projTokens = extractLocationTokens(project.location || "");
          const projOutward = projTokens?.outward || null;

          if (projOutward && projOutward.length >= 2) {
            const meRows = await mysqlQuery(
              `
              SELECT postcodeOutward
              FROM users
              WHERE uid = ?
              `,
              [viewerUid]
            );
            const me = meRows[0] || null;
            const meOutward = me?.postcodeOutward
              ? String(me.postcodeOutward).trim().toUpperCase()
              : null;

            if (
              meOutward &&
              meOutward.length >= 2 &&
              meOutward === String(projOutward).toUpperCase()
            ) {
              allow = true;
            }
          }
        } catch (err) {
          log.error({ err }, "Failed during same-area visibility check");
        }
      }
    }

    if (!allow) {
      log.info("Viewer not permitted to access project closure");
      return res.status(403).json({ error: "forbidden" });
    }

    // ------------------------------------------------------
    // Load closure row
    // ------------------------------------------------------
    let closure;
    try {
      const rows = await mysqlQuery(
        `
        SELECT
          projectId,
          didGoAhead,
          reasons,
          otherReason,
          winnerRecommendationId,
          winner_tradesman_uid,
          wouldUseAgain,
          createdBy,
          createdAt
        FROM project_closures
        WHERE projectId = ?
        LIMIT 1
        `,
        [projectId]
      );
      closure = rows[0] || null;
    } catch (err) {
      log.error({ err }, "Failed to load project_closures");
      return res.status(500).json({ error: "internal_error" });
    }

    // ------------------------------------------------------
    // No closure row yet → return minimal
    // ------------------------------------------------------
    if (!closure) {
      log.info("Project has no closure record yet");
      return res.json({
        projectId,
        didGoAhead: null,
        reasons: [],
        otherReason: null,
        winnerRecommendationId: null,
        wouldUseAgain: null,
        createdBy: null,
        createdAt: null,
        winner: null,
      });
    }

    // ------------------------------------------------------
    // Parse reasons[] JSON
    // ------------------------------------------------------
    let reasonsArr = [];
    try {
      const parsed = JSON.parse(closure.reasons || "[]");
      if (Array.isArray(parsed)) reasonsArr = parsed.map(String);
    } catch {
      reasonsArr = [];
    }

    // ------------------------------------------------------
    // Fetch winner (if any)
    // ------------------------------------------------------
    // The winner can come from two sources:
    //   1. A recommendation row (closure.winnerRecommendationId)
    //   2. A tradesperson who shared their profile (closure.winner_tradesman_uid)
    // Either way, we want the company/name for display *and* — when the
    // winner has a VMB tradesman record — their profile_picture_url so the
    // mobile closed view can show their photo instead of initials.
    let winner = null;
    if (closure.winnerRecommendationId) {
      try {
        const rows = await mysqlQuery(
          `
          SELECT id, company, name
          FROM recommendations
          WHERE id = ?
          LIMIT 1
          `,
          [closure.winnerRecommendationId]
        );
        winner = rows[0] || null;
      } catch (err) {
        log.error({ err }, "Failed to load winner recommendation");
      }
    }

    if (closure.winner_tradesman_uid) {
      try {
        const rows = await mysqlQuery(
          `
          SELECT user_id, company_name, profile_picture_url
          FROM tradesmen
          WHERE user_id = ?
          LIMIT 1
          `,
          [closure.winner_tradesman_uid]
        );
        const t = rows[0] || null;
        if (t) {
          winner = {
            id: winner?.id ?? null,
            company:
              winner?.company || t.company_name || null,
            name: winner?.name || t.company_name || null,
            tradesmanUid: t.user_id,
            profilePictureUrl: t.profile_picture_url || null,
          };
        }
      } catch (err) {
        log.error({ err }, "Failed to load winner tradesman");
      }
    }

    // ------------------------------------------------------
    // Build final response
    // ------------------------------------------------------
    return res.json({
      projectId: closure.projectId,
      didGoAhead:
        closure.didGoAhead === 1 || closure.didGoAhead === true ? 1 : 0,
      reasons: reasonsArr,
      otherReason: closure.otherReason || null,
      winnerRecommendationId: closure.winnerRecommendationId || null,
      wouldUseAgain:
        closure.wouldUseAgain === 1
          ? 1
          : closure.wouldUseAgain === 0
          ? 0
          : null,
      createdBy: closure.createdBy || null,
      createdAt: closure.createdAt || null,
      winner,
    });
  });
};
