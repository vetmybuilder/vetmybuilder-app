// server/lib/payments/handlers/chargeRefunded.js
//
// Handler for Stripe `charge.refunded` events. Logs the refund to the
// activity feed so refunds issued from the Stripe Dashboard show up
// alongside refunds issued from /admin/refunds.
//
// No automatic DB state changes (unlock re-locking, sub cancellation,
// etc.) - admin handles those manually, matching the policy on the
// /admin/refunds tool.
//
// Idempotent: dedupes on the latest refund id in the charge payload so
// Stripe replays don't double-log.

async function chargeRefunded({ event, ctx }) {
  const { mysqlQuery, log = console } = ctx;
  if (!mysqlQuery) return;

  const charge = event?.data?.object || {};
  const latestRefund = (charge.refunds?.data || []).slice(-1)[0] || null;
  if (!latestRefund?.id) return;

  // Dedupe: if we already logged this refund id, bail.
  try {
    const seen = await mysqlQuery(
      `SELECT 1 FROM activity_log
        WHERE event = 'payment.refunded' AND detail LIKE ?
        LIMIT 1`,
      [`%${latestRefund.id}%`],
    );
    if (seen && seen.length > 0) return;
  } catch (err) {
    log.warn?.({ err: err?.message }, "[chargeRefunded] dedupe query failed");
    // Fall through and log anyway - better to double-log than miss.
  }

  // Best-effort buyer lookup so the activity entry is attributed.
  let buyerUid = "unknown";
  if (charge.payment_intent) {
    try {
      const oneoff = await mysqlQuery(
        `SELECT user_id FROM payments_oneoff
          WHERE provider_payment_intent = ?
          LIMIT 1`,
        [charge.payment_intent],
      );
      if (oneoff?.[0]?.user_id) buyerUid = oneoff[0].user_id;
    } catch {}
  }

  const detail = `Refund ${latestRefund.id} for ${charge.payment_intent || charge.id} amount ${latestRefund.amount}`;
  ctx.logActivity?.("payment.refunded", "info", buyerUid, detail);
  log.info?.(
    { refund: latestRefund.id, pi: charge.payment_intent },
    "[chargeRefunded] logged",
  );
}

module.exports = { chargeRefunded };
