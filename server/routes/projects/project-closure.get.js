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

  function norm(s) {
    return String(s || "")
      .toLowerCase()
      .replace(/\s+/g, "");
  }

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
      // 2) Completed + same-area check
      if (project.status === "completed") {
        try {
          const meRows = await mysqlQuery(
            `
            SELECT locationRaw,
                   postcodeOutward,
                   postcodeSector,
                   postcode,
                   city
            FROM users
            WHERE uid = ?
            `,
            [viewerUid]
          );
          const me = meRows[0] || null;

          const tokens = [];
          if (me) {
            const candidateFields = [
              me.locationRaw,
              me.postcodeOutward,
              me.postcodeSector,
              me.postcode,
              me.city,
            ];
            for (const v of candidateFields) {
              const s = String(v || "").trim();
              if (s) tokens.push(s);
            }
          }

          const normTokens = Array.from(new Set(tokens.map(norm))).filter(
            Boolean
          );
          const projLoc = norm(project.location);

          if (
            projLoc &&
            normTokens.length > 0 &&
            normTokens.some((t) => projLoc.includes(t))
          ) {
            allow = true;
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
