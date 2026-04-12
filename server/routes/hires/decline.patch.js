// server/routes/hires/decline.patch.js
//
// PATCH /api/hires/:id/decline
//
// Auth: required (caller must be the tradesman the hire was assigned to).
// Body: { tradesmanMessage? }  (optional, max 1000 chars)
//
// Marks a pending hire as declined, records `respondedAt` and the optional
// message, and notifies the homeowner via the in-app notifications table.
// Email send is wired up in a later step of the build.
//
// Mirror of accept.patch.js — kept as a separate file rather than sharing a
// helper because each is short and clearer to read on its own.

const { RespondHireSchema } = require("../../lib/validation");
const {
  recordHireOutcome,
} = require("../../lib/observability/matchObservations");

module.exports = (router, ctx) => {
  const { auth, mysqlQuery, broadcastNotification } = ctx;
  const log = ctx.log || console;
  const TAG = "[hires/decline.patch]";
  const ROUTE = "/hires/:id/decline";

  if (!mysqlQuery) throw new Error("mysqlQuery not attached to ctx");

  router.patch(ROUTE, auth, async (req, res) => {
    const hireId = Number(req.params.id);
    if (!Number.isFinite(hireId) || hireId <= 0) {
      return res.status(400).json({ error: "Invalid hire id" });
    }

    const uid = req.user?.uid;
    if (!uid) {
      return res.status(401).json({ error: "Unauthenticated" });
    }

    const parsed = RespondHireSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: "Invalid payload", issues: parsed.error.issues });
    }

    const { tradesmanMessage } = parsed.data;

    try {
      const hireRows = await mysqlQuery(
        `SELECT id, projectId, homeownerUid, tradesmanUserId, recommendationId, status
           FROM hires
          WHERE id = ?
          LIMIT 1`,
        [hireId],
      );
      const hire = hireRows[0];

      if (!hire) {
        return res.status(404).json({ error: "Hire not found" });
      }

      // Only the assigned tradesman can decline. Recommendation hires
      // (tradesmanUserId IS NULL) also fall through here as 403 since the
      // caller can never match NULL.
      if (
        !hire.tradesmanUserId ||
        String(hire.tradesmanUserId) !== String(uid)
      ) {
        return res.status(403).json({ error: "Forbidden" });
      }

      if (hire.status !== "pending") {
        return res.status(409).json({
          error: "HIRE_NOT_PENDING",
          status: hire.status,
        });
      }

      const now = new Date();

      await mysqlQuery(
        `UPDATE hires
            SET status = 'declined',
                respondedAt = ?,
                tradesmanMessage = ?
          WHERE id = ?`,
        [now, tradesmanMessage ?? null, hireId],
      );

      // Notify the homeowner. Best-effort: log and continue if it fails so a
      // transient notification write doesn't reject the decline itself.
      try {
        const projectRows = await mysqlQuery(
          `SELECT name FROM projects WHERE id = ? LIMIT 1`,
          [hire.projectId],
        );
        const projectName = projectRows[0]?.name || "your project";

        const tradesmanRows = await mysqlQuery(
          `SELECT company_name, contact_name
             FROM tradesmen
            WHERE user_id = ?
            LIMIT 1`,
          [uid],
        );
        const tradesmanName =
          tradesmanRows[0]?.company_name ||
          tradesmanRows[0]?.contact_name ||
          "A tradesperson";

        await mysqlQuery(
          `INSERT INTO notifications
             (userId, type, message, projectId, linkPath, createdAt)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            hire.homeownerUid,
            "hire_declined",
            `${tradesmanName} declined your hire request for "${projectName}"`,
            hire.projectId,
            `/projects/${hire.projectId}`,
            now,
          ],
        );

        broadcastNotification?.(hire.homeownerUid, {
          type: "hire_declined",
          message: `${tradesmanName} declined your hire request for "${projectName}"`,
          projectId: hire.projectId,
          linkPath: `/projects/${hire.projectId}`,
        });
      } catch (e) {
        log.warn?.(`${TAG} failed to insert hire_declined notification`, {
          error: e?.message || e,
          hireId,
        });
      }

      // Project Lighthouse telemetry — fire-and-forget outcome label
      recordHireOutcome({
        mysqlQuery,
        projectId: hire.projectId,
        recommendationId: hire.recommendationId,
        tradesmanUserId: hire.tradesmanUserId,
        outcome: "declined",
        log,
      });

      return res.status(200).json({
        ok: true,
        hire: {
          id: hireId,
          projectId: hire.projectId,
          status: "declined",
          tradesmanMessage: tradesmanMessage ?? null,
          respondedAt: now.toISOString(),
        },
      });
    } catch (err) {
      log.error?.(`${TAG} error`, err);
      return res
        .status(500)
        .json({ error: "Internal error declining hire" });
    }
  });

  if (!ctx.__logged_hires_decline_patch) {
    ctx.__logged_hires_decline_patch = true;
    log.info?.(`[routes] mounted: PATCH /api${ROUTE}`);
  }
};
