// server/lib/ai/notifyMatchedTradesmen.js
const { scoreMatch } = require("./jobMatcher");
const { sendPushToUser } = require("../pushSender");

/**
 * Notify tradesmen whose trades/areas match a newly-published project.
 * Fire-and-forget — never throws into the caller.
 *
 * @param {Object} args
 * @param {Function} args.mysqlQuery
 * @param {number}   args.projectId
 * @param {string}   args.projectName
 * @param {string}   args.projectType       - form-selected type
 * @param {string}   args.projectLocation   - outward postcode
 * @param {Date}     args.projectCreatedAt
 * @param {Object}   [args.log]
 * @returns {Promise<{ notified: number, skipped: number }>}
 */
async function notifyMatchedTradesmen({
  mysqlQuery,
  projectId,
  sseBroadcast,
  projectName,
  projectType,
  projectLocation,
  projectCreatedAt,
  log = console,
}) {
  const TAG = "[notify-matched-tradesmen]";
  let notified = 0;
  let skipped = 0;

  try {
    // 1. Get the project's recommended_trades from classification
    let recommendedTrades = [];
    try {
      const classRows = await mysqlQuery(
        `SELECT structured FROM project_classifications
         WHERE project_id = ? ORDER BY classified_at DESC LIMIT 1`,
        [projectId],
      );
      if (classRows.length > 0) {
        const structured = typeof classRows[0].structured === "string"
          ? JSON.parse(classRows[0].structured)
          : classRows[0].structured;
        recommendedTrades = structured?.recommended_trades || [];
      }
    } catch (err) {
      log.warn?.(`${TAG} classification lookup failed`, { projectId, error: err?.message });
    }

    // 2. Find active tradesmen
    const tradesmen = await mysqlQuery(
      `SELECT user_id, trade_types, service_areas
       FROM tradesmen
       WHERE status = 'active'
         AND trade_types IS NOT NULL
         AND TRIM(trade_types) != ''`,
    );

    // 3. Score each tradesman and notify those with trade match > 0
    for (const t of tradesmen) {
      const trades = String(t.trade_types || "").split(",").filter(Boolean);
      const areas = String(t.service_areas || "").split(",").filter(Boolean);

      const score = scoreMatch({
        tradesmanTrades: trades,
        tradesmanAreas: areas,
        projectType: projectType || "",
        projectLocation: projectLocation || "",
        recommendedTrades,
        projectCreatedAt,
      });

      if (score.trade === 0) {
        skipped += 1;
        continue;
      }

      try {
        const message = `A new ${projectType || "project"} in ${projectLocation || "your area"} was just posted — it matches your profile.`;
        const linkPath = `/tradesman/projects?open=${projectId}`;
        await mysqlQuery(
          `INSERT INTO notifications
            (userId, type, message, projectId, linkPath, createdAt)
          VALUES (?, 'project_match', ?, ?, ?, NOW())`,
          [t.user_id, message, projectId, linkPath],
        );
        // Push real-time via SSE if available
        if (typeof sseBroadcast === "function") {
          sseBroadcast(t.user_id, {
            type: "project_match",
            message,
            projectId,
            linkPath,
          });
        }

        sendPushToUser({
          uid: t.user_id,
          type: "project_match",
          title: "VetMyBuilder",
          body: message,
          linkPath,
          mysqlQuery,
        });

        notified += 1;
      } catch (err) {
        log.warn?.(`${TAG} notification insert failed`, {
          userId: t.user_id,
          error: err?.message,
        });
      }
    }

    log.info?.(`${TAG} complete`, { projectId, notified, skipped });
  } catch (err) {
    log.error?.(`${TAG} failed`, { projectId, error: err?.message });
  }

  return { notified, skipped };
}

module.exports = { notifyMatchedTradesmen };
