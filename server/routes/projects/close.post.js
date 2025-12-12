// server/routes/projects/close.post.js
/**
 * POST /api/projects/:id/close
 * Auth: owner only
 *
 * Body:
 *  {
 *    didGoAhead: boolean,
 *    reasons?: string[],
 *    otherReason?: string,
 *    selectedRecommendationId?: number,
 *    winnerTradesmanUid?: string,
 *    winnerFromCommunity?: boolean/0/1/"true"/"false",
 *    wouldUseAgain?: boolean/0/1/"true"/"false"/null
 *  }
 */

module.exports = (router, ctx) => {
  const { auth, mysqlQuery } = ctx;
  if (!mysqlQuery) throw new Error("mysqlQuery not attached to ctx");

  const { logger, withRequest } = require("../../lib/logger");

  router.post("/projects/:id/close", auth, async (req, res) => {
    const uid = req.user?.uid;
    const projectId = Number(req.params.id);

    const log = withRequest(req, logger).child({
      route: "/projects/:id/close",
      action: "close_project",
      uid,
      projectId,
    });

    try {
      // ---------------------------------------------------------
      // VALIDATE PROJECT ID
      // ---------------------------------------------------------
      if (!Number.isFinite(projectId)) {
        log.warn("Invalid projectId");
        return res.status(400).json({ error: "invalid_id" });
      }

      // ---------------------------------------------------------
      // LOAD CURRENT PROJECT
      // ---------------------------------------------------------
      let current;
      try {
        const rows = await mysqlQuery(
          "SELECT id, ownerUserId, status FROM projects WHERE id = ?",
          [projectId]
        );
        current = rows[0] || null;
      } catch (err) {
        log.error(
          { error: err?.message, stack: err?.stack },
          "MySQL fetch error (project)"
        );
        return res.status(500).json({ error: "internal_error" });
      }

      if (!current) {
        log.info("Project not found");
        return res.status(404).json({ error: "not_found" });
      }

      if (String(current.ownerUserId) !== String(uid)) {
        log.warn("Forbidden — user is not project owner");
        return res.status(403).json({ error: "forbidden" });
      }

      // ---------------------------------------------------------
      // PARSE BODY
      // ---------------------------------------------------------
      const {
        didGoAhead,
        reasons,
        otherReason,
        selectedRecommendationId,
        winnerTradesmanUid: winnerTradesmanUidRaw,
        winnerFromCommunity,
        wouldUseAgain,
      } = req.body || {};

      const did = !!didGoAhead;
      const now = new Date().toISOString();

      // ---------------------------------------------------------
      // NORMALISE REASONS
      // ---------------------------------------------------------
      const allowedReasons = new Set([
        "budget",
        "no_show",
        "quote_too_high",
        "other",
        "tradesman_unavailable",
      ]);

      const reasonsJson = JSON.stringify(
        Array.isArray(reasons)
          ? reasons.filter((r) => allowedReasons.has(String(r)))
          : []
      );

      // ---------------------------------------------------------
      // WINNER LOGIC (recommendation or shared-profile)
      // ---------------------------------------------------------
      const candidateWinnerId = Number(selectedRecommendationId);
      const winnerRecommendationId =
        Number.isFinite(candidateWinnerId) && candidateWinnerId > 0
          ? candidateWinnerId
          : null;

      // Shared-profile winner applies only when no rec winner
      const winnerTradesmanUid =
        !winnerRecommendationId && winnerTradesmanUidRaw
          ? String(winnerTradesmanUidRaw).trim() || null
          : null;

      const winnerFromCommunityNum =
        winnerFromCommunity === 1 ||
        winnerFromCommunity === "1" ||
        winnerFromCommunity === true ||
        winnerFromCommunity === "true"
          ? 1
          : 0;

      // wouldUseAgain → normalised to null | 0 | 1
      let wouldUseAgainNorm = null;
      if (
        wouldUseAgain === 0 ||
        wouldUseAgain === "0" ||
        wouldUseAgain === false ||
        wouldUseAgain === "false"
      ) {
        wouldUseAgainNorm = 0;
      } else if (
        wouldUseAgain === 1 ||
        wouldUseAgain === "1" ||
        wouldUseAgain === true ||
        wouldUseAgain === "true"
      ) {
        wouldUseAgainNorm = 1;
      }

      const hasWinner = !!winnerRecommendationId || !!winnerTradesmanUid;

      // ---------------------------------------------------------
      // APPLY PROJECT STATUS TRANSITION
      // ---------------------------------------------------------
      try {
        if (!did) {
          // did NOT go ahead → archived
          await mysqlQuery(
            `UPDATE projects
             SET status = 'archived',
                 archivedAt = ?
             WHERE id = ?`,
            [now, projectId]
          );
        } else if (hasWinner) {
          // went ahead + winner → completed
          await mysqlQuery(
            `UPDATE projects
             SET status = 'completed',
                 completedAt = COALESCE(completedAt, ?)
             WHERE id = ?`,
            [now, projectId]
          );
        } else {
          // went ahead but hired outside VMB → archived
          await mysqlQuery(
            `UPDATE projects
             SET status = 'archived',
                 archivedAt = ?
             WHERE id = ?`,
            [now, projectId]
          );
        }
      } catch (err) {
        log.error(
          { error: err?.message, stack: err?.stack },
          "MySQL update error (project status)"
        );
        return res.status(500).json({ error: "internal_error" });
      }

      // ---------------------------------------------------------
      // UPSERT INTO project_closures
      // ---------------------------------------------------------
      try {
        const existsRows = await mysqlQuery(
          "SELECT projectId FROM project_closures WHERE projectId = ? LIMIT 1",
          [projectId]
        );
        const exists = existsRows.length > 0;

        if (exists) {
          await mysqlQuery(
            `UPDATE project_closures
             SET didGoAhead = ?,
                 reasons = ?,
                 otherReason = ?,
                 winnerRecommendationId = ?,
                 winner_tradesman_uid = ?,
                 wouldUseAgain = ?,
                 createdBy = ?,
                 createdAt = ?
             WHERE projectId = ?`,
            [
              did ? 1 : 0,
              reasonsJson,
              otherReason || null,
              winnerRecommendationId || null,
              winnerTradesmanUid || null,
              wouldUseAgainNorm,
              uid,
              now,
              projectId,
            ]
          );
        } else {
          await mysqlQuery(
            `INSERT INTO project_closures
             (projectId, didGoAhead, reasons, otherReason,
              winnerRecommendationId, winner_tradesman_uid,
              wouldUseAgain, createdBy, createdAt)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              projectId,
              did ? 1 : 0,
              reasonsJson,
              otherReason || null,
              winnerRecommendationId || null,
              winnerTradesmanUid || null,
              wouldUseAgainNorm,
              uid,
              now,
            ]
          );
        }
      } catch (err) {
        log.error(
          { error: err?.message, stack: err?.stack },
          "MySQL upsert error (project_closures)"
        );
        return res.status(500).json({ error: "internal_error" });
      }

      // ---------------------------------------------------------
      // ENSURE completedAt exists if completed but missing
      // ---------------------------------------------------------
      let project;
      try {
        const projRows = await mysqlQuery(
          "SELECT * FROM projects WHERE id = ?",
          [projectId]
        );
        project = projRows[0] || null;

        if (project && project.status === "completed" && !project.completedAt) {
          await mysqlQuery("UPDATE projects SET completedAt = ? WHERE id = ?", [
            now,
            projectId,
          ]);

          const projRows2 = await mysqlQuery(
            "SELECT * FROM projects WHERE id = ?",
            [projectId]
          );
          project = projRows2[0] || null;
        }
      } catch (err) {
        log.error(
          { error: err?.message, stack: err?.stack },
          "MySQL fetch/backfill error (completedAt)"
        );
        return res.status(500).json({ error: "internal_error" });
      }

      log.info(
        {
          status: project?.status,
          winnerRecommendationId,
          winnerTradesmanUid,
        },
        "Project closed successfully"
      );

      return res.json({ ok: true, project });
    } catch (err) {
      log.error(
        { error: err?.message, stack: err?.stack },
        "Unexpected close project error"
      );
      return res.status(500).json({
        error: "unexpected_failure",
        detail: err?.message || String(err),
      });
    }
  });
};
