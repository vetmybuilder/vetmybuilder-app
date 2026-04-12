// server/routes/hires/cancel.patch.js
//
// PATCH /api/hires/:id/cancel
//
// Auth: required (caller must be the project owner who created the hire).
// Body: { cancelReason? }
//
// Two cancellation phases:
//
//   - pending / pending_invite → no reason needed (cancelling a request the
//     tradesman hasn't yet acted on).
//   - accepted → cancelReason REQUIRED. The tradesman had committed to it,
//     so we capture why for analytics + future "frequent canceller" flagging.
//
// Allowed prior statuses: pending, pending_invite, accepted.
// Terminal statuses (declined, cancelled, expired) → 409 HIRE_NOT_CANCELLABLE.

const { CancelHireSchema } = require("../../lib/validation");

module.exports = (router, ctx) => {
  const { auth, mysqlQuery, broadcastNotification } = ctx;
  const log = ctx.log || console;
  const TAG = "[hires/cancel.patch]";
  const ROUTE = "/hires/:id/cancel";

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

    const parsed = CancelHireSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: "Invalid payload", issues: parsed.error.issues });
    }

    const { cancelReason } = parsed.data;

    try {
      const hireRows = await mysqlQuery(
        `SELECT id, projectId, homeownerUid, tradesmanUserId, status
           FROM hires
          WHERE id = ?
          LIMIT 1`,
        [hireId],
      );
      const hire = hireRows[0];

      if (!hire) {
        return res.status(404).json({ error: "Hire not found" });
      }

      if (String(hire.homeownerUid) !== String(uid)) {
        return res.status(403).json({ error: "Forbidden" });
      }

      const cancellableStatuses = ["pending", "pending_invite", "accepted"];
      if (!cancellableStatuses.includes(hire.status)) {
        return res.status(409).json({
          error: "HIRE_NOT_CANCELLABLE",
          status: hire.status,
        });
      }

      // After-acceptance cancellation requires a reason
      if (hire.status === "accepted" && !cancelReason) {
        return res.status(400).json({ error: "CANCEL_REASON_REQUIRED" });
      }

      const now = new Date();
      const previousStatus = hire.status;

      await mysqlQuery(
        `UPDATE hires
            SET status = 'cancelled',
                cancelledAt = ?,
                cancelReason = ?
          WHERE id = ?`,
        [now, cancelReason ?? null, hireId],
      );

      // Notify the tradesman if there's one assigned. Recommendation hires
      // (pending_invite, no tradesmanUserId) skip this — there's no in-app
      // user to notify, and no email has gone out yet either.
      if (
        hire.tradesmanUserId &&
        (previousStatus === "pending" || previousStatus === "accepted")
      ) {
        try {
          const projectRows = await mysqlQuery(
            `SELECT name FROM projects WHERE id = ? LIMIT 1`,
            [hire.projectId],
          );
          const projectName = projectRows[0]?.name || "your project";

          const ownerRows = await mysqlQuery(
            `SELECT firstName FROM users WHERE uid = ? LIMIT 1`,
            [hire.homeownerUid],
          );
          const ownerFirstName = ownerRows[0]?.firstName || "The homeowner";

          await mysqlQuery(
            `INSERT INTO notifications
               (userId, type, message, projectId, linkPath, createdAt)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [
              hire.tradesmanUserId,
              "hire_cancelled",
              `${ownerFirstName} cancelled the hire for "${projectName}"`,
              hire.projectId,
              `/tradesman/projects`,
              now,
            ],
          );

          broadcastNotification?.(hire.tradesmanUserId, {
            type: "hire_cancelled",
            message: `${ownerFirstName} cancelled the hire for "${projectName}"`,
            projectId: hire.projectId,
            linkPath: `/tradesman/projects`,
          });
        } catch (e) {
          log.warn?.(`${TAG} failed to insert hire_cancelled notification`, {
            error: e?.message || e,
            hireId,
          });
        }
      }

      return res.status(200).json({
        ok: true,
        hire: {
          id: hireId,
          projectId: hire.projectId,
          status: "cancelled",
          cancelReason: cancelReason ?? null,
          cancelledAt: now.toISOString(),
        },
      });
    } catch (err) {
      log.error?.(`${TAG} error`, err);
      return res
        .status(500)
        .json({ error: "Internal error cancelling hire" });
    }
  });

  if (!ctx.__logged_hires_cancel_patch) {
    ctx.__logged_hires_cancel_patch = true;
    log.info?.(`[routes] mounted: PATCH /api${ROUTE}`);
  }
};
