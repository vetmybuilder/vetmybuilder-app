// server/routes/admin/refunds.post.js
//
// POST /api/admin/refunds
// Admin-only. Issues a Stripe refund against a payment_intent_id (or
// charge_id) and records the action in admin_refunds. No automatic DB
// state changes are made to project_contact_unlocks or
// builder_subscriptions - admin handles knock-on effects manually.

module.exports = (router, ctx) => {
  const { auth, mysqlQuery, payments } = ctx;
  const { requireAdmin } = require("../../lib/roles");
  const log = ctx.log || console;
  const TAG = "[admin.refunds.post]";

  if (!mysqlQuery) throw new Error("mysqlQuery not attached to ctx");
  if (!payments?.createRefund) {
    throw new Error("payments.createRefund missing on ctx.payments");
  }

  router.post(
    "/admin/refunds",
    auth,
    requireAdmin(ctx),
    async (req, res) => {
      const adminUid = req.user?.uid;
      const { paymentIntentId, chargeId, amountPence, reason } = req.body || {};

      if (!paymentIntentId && !chargeId) {
        return res.status(400).json({ error: "missing_stripe_id" });
      }
      if (typeof reason !== "string" || reason.trim().length < 5) {
        return res.status(400).json({ error: "reason_required" });
      }
      const amt = Number(amountPence);
      const amount = Number.isFinite(amt) && amt > 0 ? amt : null;
      const trimmedReason = reason.trim();

      try {
        const refund = await payments.createRefund({
          paymentIntentId,
          chargeId,
          amountPence: amount,
          reason: "requested_by_customer",
          metadata: { admin_uid: adminUid, reason: trimmedReason },
        });

        await mysqlQuery(
          `INSERT INTO admin_refunds
            (stripe_refund_id, payment_intent_id, charge_id, amount_pence,
             reason, admin_uid, status)
           VALUES (?, ?, ?, ?, ?, ?, 'success')`,
          [
            refund.id,
            paymentIntentId || null,
            chargeId || null,
            amount,
            trimmedReason,
            adminUid,
          ],
        );

        ctx.logActivity?.(
          "admin.refund",
          "info",
          adminUid,
          `Refund ${refund.id} for ${paymentIntentId || chargeId} (${trimmedReason})`,
        );

        return res.json({ ok: true, refundId: refund.id });
      } catch (err) {
        const msg = err?.message || String(err);
        log.warn?.(`${TAG} stripe error`, { msg });
        await mysqlQuery(
          `INSERT INTO admin_refunds
            (payment_intent_id, charge_id, amount_pence, reason, admin_uid,
             status, error_text)
           VALUES (?, ?, ?, ?, ?, 'error', ?)`,
          [
            paymentIntentId || null,
            chargeId || null,
            amount,
            trimmedReason,
            adminUid,
            msg,
          ],
        );
        return res.status(502).json({ error: "refund failed: " + msg });
      }
    },
  );
};
