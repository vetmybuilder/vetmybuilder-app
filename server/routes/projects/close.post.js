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
 *    winnerRecommendationId?: number,   // (accepted)
 *    winnerRecId?: number,              // (accepted)
 *    winnerTradesmanUid?: string,
 *    winnerFromCommunity?: boolean/0/1/"true"/"false",
 *    wouldUseAgain?: boolean/0/1/"true"/"false"/null
 *  }
 */

const { sendPushToUser } = require("../../lib/pushSender");
const analytics = require("../../lib/analytics");

module.exports = (router, ctx) => {
  const { auth, mysqlQuery, extractLocationTokens, broadcastNotification } = ctx;
  if (!mysqlQuery) throw new Error("mysqlQuery not attached to ctx");

  const { logger, withRequest } = require("../../lib/logger");

  // helper: take first defined/non-empty value from a list of keys
  function pickBody(reqBody, keys) {
    const b = reqBody || {};
    for (const k of keys) {
      const v = b?.[k];
      if (v === undefined || v === null) continue;
      if (typeof v === "string" && !v.trim()) continue;
      return v;
    }
    return undefined;
  }

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
        return res.status(500).json({
          error: "internal_error",
          message:
            process.env.TEST_ENV === "e2e"
              ? err?.message || String(err)
              : undefined,
        });
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
      const body = req.body || {};

      const didGoAhead = !!body.didGoAhead;
      const reasons = body.reasons;
      const otherReason = body.otherReason;

      // IMPORTANT: support multiple field names for winner rec id
      const winnerRecRaw = pickBody(body, [
        "selectedRecommendationId",
        "winnerRecommendationId",
        "winnerRecId",
        "winner_recommendation_id",
        "_winnerRecommendationId",
      ]);

      const winnerTradesmanUidRaw = pickBody(body, [
        "winnerTradesmanUid",
        "winner_tradesman_uid",
        "_winnerTradesmanUid",
      ]);

      const winnerFromCommunity = body.winnerFromCommunity;
      const wouldUseAgain = body.wouldUseAgain;

      const now = new Date().toISOString().slice(0, 19).replace("T", " ");

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
      const candidateWinnerId = Number(
        typeof winnerRecRaw === "string" ? winnerRecRaw.trim() : winnerRecRaw
      );

      const winnerRecommendationId =
        Number.isFinite(candidateWinnerId) && candidateWinnerId > 0
          ? candidateWinnerId
          : null;

      // Always accept tradesman uid if provided (even when winnerRecommendationId exists).
      // If not provided but a winner recommendation exists, try to resolve the UID by
      // matching the recommendation's company name against the tradesmen table — this
      // ensures the community tab can link to the full tradesman profile.
      let winnerTradesmanUid = winnerTradesmanUidRaw
        ? String(winnerTradesmanUidRaw).trim() || null
        : null;

      if (!winnerTradesmanUid && winnerRecommendationId) {
        try {
          const recRows = await mysqlQuery(
            `SELECT company FROM recommendations WHERE id = ? LIMIT 1`,
            [winnerRecommendationId]
          );
          const company = recRows?.[0]?.company;
          if (company) {
            const tRows = await mysqlQuery(
              `SELECT user_id FROM tradesmen WHERE company_name = ? LIMIT 1`,
              [company]
            );
            if (tRows?.[0]?.user_id) {
              winnerTradesmanUid = tRows[0].user_id;
            }
          }
        } catch (e) {
          log.warn({ error: e?.message }, "Could not resolve winnerTradesmanUid from recommendation");
        }
      }

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

      log.info(
        {
          didGoAhead,
          winnerRecommendationId,
          winnerTradesmanUid,
          winnerFromCommunityNum,
          hasWinner,
        },
        "Close payload normalised"
      );

      // ---------------------------------------------------------
      // APPLY PROJECT STATUS TRANSITION
      // ---------------------------------------------------------
      try {
        if (!didGoAhead) {
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
        return res.status(500).json({
          error: "internal_error",
          message:
            process.env.TEST_ENV === "e2e"
              ? err?.message || String(err)
              : undefined,
        });
      }

      // Mark all notifications for this project as read
      try {
        await mysqlQuery(
          `UPDATE notifications SET readAt = COALESCE(readAt, NOW())
            WHERE userId = ? AND projectId = ? AND readAt IS NULL`,
          [uid, projectId],
        );
      } catch (markErr) {
        log.warn?.({ err: markErr?.message, projectId }, "failed to mark notifications read on close (non-fatal)");
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
                 winner_from_community = ?,
                 wouldUseAgain = ?,
                 createdBy = ?,
                 createdAt = ?
             WHERE projectId = ?`,
            [
              didGoAhead ? 1 : 0,
              reasonsJson,
              otherReason || null,
              winnerRecommendationId || null,
              winnerTradesmanUid || null,
              winnerFromCommunityNum,
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
              winner_from_community,
              wouldUseAgain, createdBy, createdAt)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              projectId,
              didGoAhead ? 1 : 0,
              reasonsJson,
              otherReason || null,
              winnerRecommendationId || null,
              winnerTradesmanUid || null,
              winnerFromCommunityNum,
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
        return res.status(500).json({
          error: "internal_error",
          message:
            process.env.TEST_ENV === "e2e"
              ? err?.message || String(err)
              : undefined,
        });
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
        return res.status(500).json({
          error: "internal_error",
          message:
            process.env.TEST_ENV === "e2e"
              ? err?.message || String(err)
              : undefined,
        });
      }

      log.info(
        {
          status: project?.status,
          winnerRecommendationId,
          winnerTradesmanUid,
        },
        "Project closed successfully"
      );

      res.json({ ok: true, project });
      analytics.trackProjectClosed(req.user?.uid, { projectId });
      ctx.logActivity("project.close", "info", req.user.uid, `Project #${projectId}, didGoAhead=${!!didGoAhead}`);

      // ---- BACKGROUND: notify local users that a neighbour completed a project ----
      if (project && project.status === "completed" && typeof extractLocationTokens === "function") {
        (async () => {
          try {
            const locTokens = extractLocationTokens(project.location);
            const whereParts = [];
            const areaParams = [];
            if (locTokens.full)    { whereParts.push("u.postcode = ?");        areaParams.push(locTokens.full); }
            if (locTokens.sector)  { whereParts.push("u.postcodeSector = ?");  areaParams.push(locTokens.sector); }
            if (locTokens.outward) { whereParts.push("u.postcodeOutward = ?"); areaParams.push(locTokens.outward); }
            if (locTokens.city)    { whereParts.push("LOWER(u.city) = ?");     areaParams.push(String(locTokens.city).toLowerCase()); }
            if (!whereParts.length) return;

            const areaWhere = whereParts.join(" OR ");
            const areaUserRows = await mysqlQuery(
              `SELECT u.uid FROM users u WHERE (${areaWhere}) AND u.uid <> ?`,
              [...areaParams, project.ownerUserId]
            );

            const message = `A neighbour completed a project in your area — "${project.name}"`;
            const linkPath = `/projects/${projectId}/completed`;
            for (const row of areaUserRows) {
              await mysqlQuery(
                `INSERT INTO notifications (userId, type, message, projectId, linkPath, createdAt)
                 VALUES (?, 'project_closed_local', ?, ?, ?, NOW())`,
                [row.uid, message, projectId, linkPath]
              );
              broadcastNotification?.(row.uid, { type: "project_closed_local", message, projectId, linkPath });

              sendPushToUser({
                uid: row.uid,
                type: "project_closed_local",
                title: "VetMyBuilder",
                body: message,
                linkPath,
                mysqlQuery,
                logActivity: ctx.logActivity,
              });
            }
            log.info({ projectId, count: areaUserRows.length }, "project_closed_local notifications sent");
          } catch (e) {
            log.warn({ error: e?.message }, "project_closed_local notification error");
          }
        })();
      }

      return;
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
