// server/routes/admin/spotlight.grant.post.js
//
// Two admin-only routes for granting and revoking Spotlight access
// without requiring a payment. We don't take payments yet, but we want
// to seed the marketplace with a small number of editorially-chosen
// spotlight tradespeople. Once Stripe / etc. is wired up, these stay
// useful as a manual override.
//
// POST /api/admin/tradesmen/:uid/spotlight/grant
//   Body: { days?: number }   default 30, capped at 365.
//   Effect: inserts a row in payments_oneoff that mirrors the shape a
//   real purchase would produce (type='spotlight', status='active',
//   amount=0). The /api/tradesmen/spotlight feed picks it up the same
//   way it picks up paid spotlights.
//
// POST /api/admin/tradesmen/:uid/spotlight/revoke
//   Effect: marks every active admin-granted spotlight row for this
//   user as 'cancelled'. We deliberately leave PAID rows alone so a
//   refund / cancellation always goes through the proper flow.

const { logger, withRequest } = require("../../lib/logger");

const ADMIN_GRANT_PROVIDER_PREFIX = "admin-grant-";

module.exports = (router, ctx) => {
  const { auth, mysqlQuery } = ctx;
  const { requireAdmin } = require("../../lib/roles");

  if (!mysqlQuery) throw new Error("mysqlQuery not attached to ctx");

  const GRANT_TAG = "admin.spotlight.grant";
  const REVOKE_TAG = "admin.spotlight.revoke";

  router.post(
    "/admin/tradesmen/:uid/spotlight/grant",
    auth,
    requireAdmin(ctx),
    async (req, res) => {
      const log = withRequest(req).child({ route: GRANT_TAG });
      const { uid } = req.params;
      const rawDays = Number(req.body?.days);
      const days = Number.isFinite(rawDays) && rawDays > 0
        ? Math.min(Math.floor(rawDays), 365)
        : 30;

      if (!uid) {
        return res.status(400).json({ ok: false, error: "uid_required" });
      }

      try {
        // Verify the tradesman row exists.
        const tradesmanRows = await mysqlQuery(
          `SELECT user_id FROM tradesmen WHERE user_id = ? LIMIT 1`,
          [uid],
        );
        if (!tradesmanRows.length) {
          log.warn({ uid }, "tradesman not found");
          return res.status(404).json({ ok: false, error: "tradesman_not_found" });
        }

        const sessionId = `${ADMIN_GRANT_PROVIDER_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

        await mysqlQuery(
          `
          INSERT INTO payments_oneoff
            (user_id, type, entity_id, amount, currency, status,
             provider_session_id, expires_at, created_at)
          VALUES (?, 'spotlight', NULL, 0, 'GBP', 'active',
                  ?, DATE_ADD(NOW(), INTERVAL ? DAY), NOW())
          `,
          [uid, sessionId, days],
        );

        log.info(
          { uid, days, sessionId, actor: req.user?.uid },
          "spotlight granted by admin",
        );

        res.json({ ok: true, uid, days, sessionId });
        ctx.logActivity(
          "admin.spotlight.grant",
          "info",
          req.user?.uid,
          `Granted spotlight to ${uid} for ${days} days`,
        );
      } catch (err) {
        logger.error(
          { route: GRANT_TAG, uid, err: err?.message, stack: err?.stack },
          "spotlight grant failed",
        );
        res.status(500).json({ ok: false, error: "server_error" });
      }
    },
  );

  router.post(
    "/admin/tradesmen/:uid/spotlight/revoke",
    auth,
    requireAdmin(ctx),
    async (req, res) => {
      const log = withRequest(req).child({ route: REVOKE_TAG });
      const { uid } = req.params;

      if (!uid) {
        return res.status(400).json({ ok: false, error: "uid_required" });
      }

      try {
        // Only revoke admin-granted rows. Paid rows must go through the
        // proper refund path, not be silently cancelled.
        const result = await mysqlQuery(
          `
          UPDATE payments_oneoff
             SET status = 'cancelled',
                 expires_at = NOW()
           WHERE user_id = ?
             AND type = 'spotlight'
             AND status = 'active'
             AND provider_session_id LIKE ?
          `,
          [uid, `${ADMIN_GRANT_PROVIDER_PREFIX}%`],
        );

        log.info(
          { uid, revoked: result.affectedRows, actor: req.user?.uid },
          "spotlight admin grants revoked",
        );

        res.json({ ok: true, uid, revoked: result.affectedRows });
        ctx.logActivity(
          "admin.spotlight.revoke",
          "info",
          req.user?.uid,
          `Revoked admin-granted spotlight for ${uid} (${result.affectedRows} rows)`,
        );
      } catch (err) {
        logger.error(
          { route: REVOKE_TAG, uid, err: err?.message, stack: err?.stack },
          "spotlight revoke failed",
        );
        res.status(500).json({ ok: false, error: "server_error" });
      }
    },
  );
};
