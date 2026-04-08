// server/lib/observability/matchObservations.js
//
// Project Lighthouse — Day 2 telemetry helper.
//
// Logs every (project, builder) surfacing event into the match_observations
// table, plus records the homeowner action and hire outcome that follow.
// This is the foundational dataset every future ranker model is trained on.
//
// All functions are FIRE-AND-FORGET. They wrap their own try/catch and never
// throw — telemetry must never break the user-facing request. If a write
// fails we log a warning and move on.
//
// Surface contexts (extend as new surfaces appear):
//   'top_recommendations'  : the homeowner project view's recs card
//   'jobs_list'            : the tradesman dashboard jobs list
//   'builder_profile_visit': a homeowner navigated to a builder profile
//   'hire_created'         : synthetic — created at hire time so the outcome
//                            row exists even if no prior surface log exists
//
// Homeowner actions:
//   'viewed' | 'clicked' | 'hired' | 'dismissed'
//
// Hire outcomes:
//   'accepted' | 'declined' | 'cancelled' | 'expired' | 'completed'
//
// See: project-lighthouse/project-lighthouse-plan.pptx (slides 9 + 16)
// See: mysql_schema.sql for the table definition.

const TAG = "[match-observations]";

/**
 * Log every builder/recommendation surfaced to a homeowner from a single
 * page render. Bulk-inserts one row per item so a single round-trip
 * captures the whole list.
 *
 * @param {Object} args
 * @param {Function} args.mysqlQuery   ctx.mysqlQuery
 * @param {number}   args.projectId    the project the homeowner was viewing
 * @param {string}   args.surfaceContext  e.g. 'top_recommendations'
 * @param {Array}    args.items        each item has { recommendationId?, tradesmanUserId?, score? }
 * @param {Object}   [args.log]        optional logger (defaults to console)
 */
async function logSurfacings({
  mysqlQuery,
  projectId,
  surfaceContext,
  items,
  log = console,
}) {
  if (!mysqlQuery) return; // no DB available — silently skip
  if (!Number.isFinite(Number(projectId))) return;
  if (!Array.isArray(items) || items.length === 0) return;

  // Filter out anything that has neither a recommendation_id nor a
  // tradesman_user_id — those rows would violate the implicit
  // "at least one is set" contract and aren't useful as training data.
  const valid = items
    .map((it, idx) => ({
      recommendationId:
        it?.recommendationId != null ? Number(it.recommendationId) : null,
      tradesmanUserId: it?.tradesmanUserId ? String(it.tradesmanUserId) : null,
      rank: idx + 1,
      score:
        Number.isFinite(Number(it?.score)) ? Number(it.score) : null,
    }))
    .filter((it) => it.recommendationId != null || it.tradesmanUserId != null);

  if (valid.length === 0) return;

  try {
    // Build a single multi-row INSERT — one round-trip regardless of
    // how many items are in the page render.
    const placeholders = valid.map(() => "(?, ?, ?, ?, ?, ?)").join(", ");
    const params = [];
    for (const it of valid) {
      params.push(
        Number(projectId),
        it.recommendationId,
        it.tradesmanUserId,
        surfaceContext,
        it.rank,
        it.score,
      );
    }

    await mysqlQuery(
      `
      INSERT INTO match_observations
        (project_id, recommendation_id, tradesman_user_id,
         surface_context, rank_position, match_score)
      VALUES ${placeholders}
      `,
      params,
    );
  } catch (e) {
    log.warn?.(`${TAG} logSurfacings failed`, {
      projectId,
      surfaceContext,
      count: valid.length,
      error: e?.message || e,
    });
  }
}

/**
 * Record a homeowner action against the most recent matching surfacing.
 *
 * Strategy: find the latest match_observations row for this (project,
 * recommendation/tradesman) pair that has no homeowner_action yet, and
 * stamp it. If no such row exists (e.g. the user clicked Hire before any
 * surfacing was logged), we INSERT a synthetic 'hire_created' row so the
 * outcome chain still exists.
 */
async function recordHomeownerAction({
  mysqlQuery,
  projectId,
  recommendationId = null,
  tradesmanUserId = null,
  action,
  log = console,
}) {
  if (!mysqlQuery) return;
  if (!Number.isFinite(Number(projectId))) return;
  if (!action) return;
  if (recommendationId == null && !tradesmanUserId) return;

  try {
    // Try to UPDATE an existing surfacing row first.
    const whereParts = ["project_id = ?", "homeowner_action IS NULL"];
    const updateParams = [Number(projectId)];

    if (recommendationId != null) {
      whereParts.push("recommendation_id = ?");
      updateParams.push(Number(recommendationId));
    } else {
      whereParts.push("tradesman_user_id = ?");
      updateParams.push(String(tradesmanUserId));
    }

    const result = await mysqlQuery(
      `
      UPDATE match_observations
         SET homeowner_action = ?,
             homeowner_action_at = NOW()
       WHERE ${whereParts.join(" AND ")}
       ORDER BY surfaced_at DESC
       LIMIT 1
      `,
      [String(action), ...updateParams],
    );

    // affectedRows is 0 if there was no prior surfacing — insert a synthetic
    // observation so the outcome row exists for downstream training.
    if ((result?.affectedRows ?? 0) === 0) {
      await mysqlQuery(
        `
        INSERT INTO match_observations
          (project_id, recommendation_id, tradesman_user_id,
           surface_context, rank_position, match_score,
           homeowner_action, homeowner_action_at)
        VALUES (?, ?, ?, 'hire_created', 1, NULL, ?, NOW())
        `,
        [
          Number(projectId),
          recommendationId != null ? Number(recommendationId) : null,
          tradesmanUserId ? String(tradesmanUserId) : null,
          String(action),
        ],
      );
    }
  } catch (e) {
    log.warn?.(`${TAG} recordHomeownerAction failed`, {
      projectId,
      recommendationId,
      tradesmanUserId,
      action,
      error: e?.message || e,
    });
  }
}

/**
 * Record a hire outcome (the tradesman's response or homeowner cancel)
 * against the matching observation row. This is the LABEL — the most
 * valuable single field on the table.
 */
async function recordHireOutcome({
  mysqlQuery,
  projectId,
  recommendationId = null,
  tradesmanUserId = null,
  outcome,
  log = console,
}) {
  if (!mysqlQuery) return;
  if (!Number.isFinite(Number(projectId))) return;
  if (!outcome) return;
  if (recommendationId == null && !tradesmanUserId) return;

  try {
    const whereParts = ["project_id = ?", "hire_outcome IS NULL"];
    const params = [Number(projectId)];

    if (recommendationId != null) {
      whereParts.push("recommendation_id = ?");
      params.push(Number(recommendationId));
    } else {
      whereParts.push("tradesman_user_id = ?");
      params.push(String(tradesmanUserId));
    }

    await mysqlQuery(
      `
      UPDATE match_observations
         SET hire_outcome = ?,
             hire_outcome_at = NOW()
       WHERE ${whereParts.join(" AND ")}
       ORDER BY surfaced_at DESC
       LIMIT 1
      `,
      [String(outcome), ...params],
    );
  } catch (e) {
    log.warn?.(`${TAG} recordHireOutcome failed`, {
      projectId,
      recommendationId,
      tradesmanUserId,
      outcome,
      error: e?.message || e,
    });
  }
}

module.exports = {
  logSurfacings,
  recordHomeownerAction,
  recordHireOutcome,
};
