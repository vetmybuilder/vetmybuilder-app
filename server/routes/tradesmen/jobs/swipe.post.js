// server/routes/tradesmen/jobs/swipe.post.js
//
// POST /api/tradesmen/jobs/:projectId/swipe
// Body: { decision: 'right' | 'left' }
// Authenticated tradesman swipes on a job listing (project).
// - right  → interested (pending). If homeowner already swiped right, forms match immediately.
// - left   → not interested (declined_by_builder).

const { fireMatchFormed } = require("../../../lib/fireMatchFormed");
const {
  isBuilderSubscribed,
} = require("../../../lib/subscriptions/isBuilderSubscribed");

module.exports = function mountTradesmenJobsSwipe(router, ctx) {
  const { auth, mysqlQuery } = ctx;
  if (!mysqlQuery) throw new Error("mysqlQuery not attached to ctx");

  const { requireActiveTradesman } = require("../../../lib/roles");

  router.post(
    "/tradesmen/jobs/:projectId/swipe",
    auth,
    requireActiveTradesman(ctx),
    async (req, res) => {
      const uid = req.user?.uid;
      if (!uid) return res.status(401).json({ error: "Unauthorized" });

      const pid = Number(req.params.projectId);
      if (!Number.isFinite(pid) || pid <= 0) {
        return res.status(400).json({ error: "Invalid project id" });
      }

      const { decision } = req.body || {};
      if (decision !== "right" && decision !== "left") {
        return res
          .status(400)
          .json({ error: "decision must be 'right' or 'left'" });
      }

      // Verify project exists
      const projRows = await mysqlQuery(
        `SELECT id, ownerUserId FROM projects WHERE id = ? LIMIT 1`,
        [pid],
      );
      const project = projRows?.[0];
      if (!project) return res.status(404).json({ error: "Project not found" });

      // Builder cannot swipe their own project
      if (String(project.ownerUserId) === String(uid)) {
        return res.status(403).json({ error: "Cannot swipe your own project" });
      }

      const homeownerUid = project.ownerUserId;

      // Determine source: recommended if any rec row links this tradesman to this project
      const recRows = await mysqlQuery(
        `SELECT id FROM recommendations
          WHERE linked_tradesman_uid = ? AND projectId = ?
          LIMIT 1`,
        [uid, pid],
      );
      const source = recRows?.length > 0 ? "recommended" : "subscribed";

      // Subscription gate: a non-recommended (subscribed-tier) right-swipe
      // requires an active builder_subscriptions row. Recommendations are
      // always free, and left-swipes never need a subscription. Returning
      // 403 with `requiresSubscription: true` so the deck can route the
      // builder to /tradesman/billing instead of silently failing.
      if (decision === "right" && source === "subscribed") {
        const subscribed = await isBuilderSubscribed(uid, mysqlQuery);
        if (!subscribed) {
          return res.status(403).json({
            error: "subscription_required",
            requiresSubscription: true,
            message:
              "An active subscription is required to swipe right on subscribed-tier jobs.",
          });
        }
      }

      const status = decision === "right" ? "pending" : "declined_by_builder";

      // Terminal states are sticky. Once a swipe_interest row is in
      // declined_by_homeowner / declined_by_builder / matched / expired,
      // the OTHER side cannot transition it back. Without this rule, a
      // race where (homeowner left-swipes -> builder right-swipes) was
      // overwriting the homeowner's "no" with "pending" and then forming
      // a match the homeowner never agreed to.
      await mysqlQuery(
        `INSERT INTO swipe_interest
           (project_id, homeowner_uid, builder_uid, source, status, builder_swiped_at)
         VALUES (?, ?, ?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE
           status = CASE
             WHEN status IN ('declined_by_homeowner','declined_by_builder','matched','expired')
               THEN status
             ELSE VALUES(status)
           END,
           source = VALUES(source),
           builder_swiped_at = VALUES(builder_swiped_at)`,
        [pid, homeownerUid, uid, source, status],
      );

      // Match formation: only when the row is currently 'pending' (i.e.
      // homeowner already swiped right and we just upgraded it to pending
      // via the builder's right-swipe; or homeowner had pending and we
      // confirmed). Read the live status and the homeowner timestamp -
      // both must signal mutual right-swipes.
      if (decision === "right") {
        const rowCheck = await mysqlQuery(
          `SELECT status, homeowner_swiped_at FROM swipe_interest
            WHERE project_id = ? AND builder_uid = ?
            LIMIT 1`,
          [pid, uid],
        );
        const cur = rowCheck?.[0];
        const homeownerSwiped = cur?.homeowner_swiped_at != null;
        const isPending = cur?.status === "pending";
        if (isPending && homeownerSwiped) {
          await mysqlQuery(
            `UPDATE swipe_interest SET status = 'matched'
              WHERE project_id = ? AND builder_uid = ?`,
            [pid, uid],
          );
          await fireMatchFormed({ projectId: pid, mysqlQuery, ctx });
          return res.status(200).json({ ok: true, matched: true, projectId: pid });
        }
      }

      return res.status(200).json({ ok: true, matched: false, projectId: pid });
    },
  );
};
