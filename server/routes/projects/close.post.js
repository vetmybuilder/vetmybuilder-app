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

      const winnerOther =
        body.winnerOther === true ||
        body.winnerOther === 1 ||
        body.winnerOther === "1" ||
        body.winnerOther === "true";

      // CR3 satisfaction + boost. All optional - pre-CR3 callers (and the
      // off-platform branch) won't send these and we persist NULL/0.
      const satisfiedRaw = body.satisfied;
      const satisfiedNum =
        satisfiedRaw === true ||
        satisfiedRaw === 1 ||
        satisfiedRaw === "1" ||
        satisfiedRaw === "yes" ||
        satisfiedRaw === "true"
          ? 1
          : satisfiedRaw === false ||
              satisfiedRaw === 0 ||
              satisfiedRaw === "0" ||
              satisfiedRaw === "no" ||
              satisfiedRaw === "false"
            ? 0
            : null;

      const overallRatingRaw = Number(body.overallRating);
      const overallRating =
        Number.isFinite(overallRatingRaw) &&
        overallRatingRaw >= 0 &&
        overallRatingRaw <= 5
          ? overallRatingRaw
          : null;

      // ratings_json must be a {quality,reliability,...} shape. We accept
      // either an object on body.ratings or a pre-stringified JSON. Drop
      // anything else.
      const RATING_KEYS = [
        "quality",
        "reliability",
        "communication",
        "trust",
        "value",
      ];
      let ratingsJson = null;
      if (body.ratings && typeof body.ratings === "object") {
        const clean = {};
        for (const k of RATING_KEYS) {
          const n = Number(body.ratings[k]);
          clean[k] = Number.isFinite(n) && n >= 0 && n <= 5 ? n : 0;
        }
        // Only persist if at least one non-zero - saves churn for the
        // "satisfied=yes" path that doesn't collect category ratings.
        if (Object.values(clean).some((v) => v > 0)) {
          ratingsJson = JSON.stringify(clean);
        }
      }

      const boostConsentNum =
        body.boostConsent === true ||
        body.boostConsent === 1 ||
        body.boostConsent === "1" ||
        body.boostConsent === "true"
          ? 1
          : 0;

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

      // "Someone else" → work went ahead off-platform. Treat as completed so
      // it appears in the homeowner's Completed tab, just with no winner uid.
      // Without this flag we'd archive (the legacy "no winner" branch) which
      // hides the project from the owner.
      const shouldComplete = didGoAhead && (hasWinner || winnerOther);

      log.info(
        {
          didGoAhead,
          winnerRecommendationId,
          winnerTradesmanUid,
          winnerFromCommunityNum,
          hasWinner,
          winnerOther,
          shouldComplete,
        },
        "Close payload normalised"
      );

      // ---------------------------------------------------------
      // APPLY PROJECT STATUS TRANSITION
      // ---------------------------------------------------------
      // CR3: every closure archives the project. The completed tab is
      // gone from the homeowner UI so there's no reason to hold rows
      // in 'completed'. We still stamp completedAt when work went
      // ahead so analytics can distinguish completions from drop-offs,
      // but the visible status is always 'archived'. Boost consent
      // lives separately on project_closures.boost_consent.
      try {
        if (didGoAhead) {
          await mysqlQuery(
            `UPDATE projects
             SET status = 'archived',
                 archivedAt = ?,
                 completedAt = COALESCE(completedAt, ?)
             WHERE id = ?`,
            [now, now, projectId],
          );
        } else {
          await mysqlQuery(
            `UPDATE projects
             SET status = 'archived',
                 archivedAt = ?
             WHERE id = ?`,
            [now, projectId],
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

      // Closing a project retires its activity feed for the owner. Stale
      // "New message from X" / match-formed / recommendation entries are
      // no longer actionable once the job is closed - keeping them in
      // the bell just clutters. We DELETE rather than mark-read so they
      // disappear from the inbox dropdown immediately, then fire a
      // silent SSE so any open tab refetches its inbox without a
      // browser refresh.
      try {
        await mysqlQuery(
          `DELETE FROM notifications WHERE userId = ? AND projectId = ?`,
          [uid, projectId],
        );
      } catch (markErr) {
        log.warn?.({ err: markErr?.message, projectId }, "failed to delete owner notifications on close (non-fatal)");
      }

      try {
        ctx.broadcastNotification?.(uid, {
          type: "inbox_refresh",
          message: "",
          projectId,
        });
      } catch (sseErr) {
        log.warn?.({ err: sseErr?.message }, "failed to broadcast inbox_refresh (non-fatal)");
      }

      // Mirror the cleanup on the tradesperson side: every builder who
      // matched on this project loses their stale notifications too, and
      // gets a silent inbox_refresh so their live tab updates without a
      // browser refresh. Without this, the trade keeps seeing the
      // conversation in their inbox while the homeowner has already
      // moved on - confusing asymmetric state.
      try {
        const tradesRows = await mysqlQuery(
          `SELECT DISTINCT builder_uid FROM swipe_interest
             WHERE project_id = ? AND status = 'matched'`,
          [projectId],
        );
        for (const row of tradesRows) {
          const builderUid = row?.builder_uid;
          if (!builderUid) continue;
          try {
            await mysqlQuery(
              `DELETE FROM notifications WHERE userId = ? AND projectId = ?`,
              [builderUid, projectId],
            );
          } catch (delErr) {
            log.warn?.(
              { err: delErr?.message, builderUid, projectId },
              "failed to delete tradesperson notifications on close (non-fatal)",
            );
          }
          try {
            ctx.broadcastNotification?.(builderUid, {
              type: "inbox_refresh",
              message: "",
              projectId,
            });
          } catch (sseErr) {
            log.warn?.(
              { err: sseErr?.message, builderUid },
              "failed to broadcast inbox_refresh to tradesperson (non-fatal)",
            );
          }
        }
      } catch (tErr) {
        log.warn?.(
          { err: tErr?.message, projectId },
          "failed to enumerate matched tradespeople on close (non-fatal)",
        );
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
                 satisfied = ?,
                 overall_rating = ?,
                 ratings_json = ?,
                 boost_consent = ?,
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
              satisfiedNum,
              overallRating,
              ratingsJson,
              boostConsentNum,
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
              wouldUseAgain,
              satisfied, overall_rating, ratings_json, boost_consent,
              createdBy, createdAt)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              projectId,
              didGoAhead ? 1 : 0,
              reasonsJson,
              otherReason || null,
              winnerRecommendationId || null,
              winnerTradesmanUid || null,
              winnerFromCommunityNum,
              wouldUseAgainNorm,
              satisfiedNum,
              overallRating,
              ratingsJson,
              boostConsentNum,
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
            const { getBoroughCodes } = require("../../lib/boroughPostcodes");
            if (locTokens.full)    { whereParts.push("u.postcode = ?");        areaParams.push(locTokens.full); }
            if (locTokens.sector)  { whereParts.push("u.postcodeSector = ?");  areaParams.push(locTokens.sector); }
            if (locTokens.outward) {
              for (const code of getBoroughCodes(locTokens.outward)) {
                whereParts.push("u.postcodeOutward = ?"); areaParams.push(code);
              }
            }
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
