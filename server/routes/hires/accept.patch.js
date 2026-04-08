// server/routes/hires/accept.patch.js
//
// PATCH /api/hires/:id/accept
//
// Auth: required (caller must be the tradesman the hire was assigned to).
// Body: { tradesmanMessage? }  (optional, max 1000 chars)
//
// Marks a pending hire as accepted, records `respondedAt` and the optional
// message, and notifies the homeowner via the in-app notifications table.
// Email send is wired up in a later step of the build.

const { RespondHireSchema } = require("../../lib/validation");
const {
  recordHireOutcome,
} = require("../../lib/observability/matchObservations");

module.exports = (router, ctx) => {
  const { auth, mysqlQuery } = ctx;
  const log = ctx.log || console;
  const TAG = "[hires/accept.patch]";
  const ROUTE = "/hires/:id/accept";

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

      // Only the assigned tradesman can accept. Recommendation hires
      // (tradesmanUserId IS NULL) also fall through here as 403, since the
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
            SET status = 'accepted',
                respondedAt = ?,
                tradesmanMessage = ?
          WHERE id = ?`,
        [now, tradesmanMessage ?? null, hireId],
      );

      // Notify the homeowner. Best-effort: log and continue if it fails so a
      // transient notification write doesn't reject the accept itself.
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
            "hire_accepted",
            `${tradesmanName} accepted your hire request for "${projectName}"`,
            hire.projectId,
            `/projects/${hire.projectId}`,
            now,
          ],
        );
      } catch (e) {
        log.warn?.(`${TAG} failed to insert hire_accepted notification`, {
          error: e?.message || e,
          hireId,
        });
      }

      // Project Lighthouse telemetry — labels the matching observation row
      // with the outcome (the most valuable single field on the table).
      recordHireOutcome({
        mysqlQuery,
        projectId: hire.projectId,
        recommendationId: hire.recommendationId,
        tradesmanUserId: hire.tradesmanUserId,
        outcome: "accepted",
        log,
      });

      return res.status(200).json({
        ok: true,
        hire: {
          id: hireId,
          projectId: hire.projectId,
          status: "accepted",
          tradesmanMessage: tradesmanMessage ?? null,
          respondedAt: now.toISOString(),
        },
      });
    } catch (err) {
      log.error?.(`${TAG} error`, err);
      return res
        .status(500)
        .json({ error: "Internal error accepting hire" });
    }
  });

  if (!ctx.__logged_hires_accept_patch) {
    ctx.__logged_hires_accept_patch = true;
    log.info?.(`[routes] mounted: PATCH /api${ROUTE}`);
  }
};
