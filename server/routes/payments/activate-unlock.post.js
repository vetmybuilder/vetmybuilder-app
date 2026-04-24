// server/routes/payments/activate-unlock.post.js
/**
 * POST /api/payments/activate-unlock
 * Auth: required
 * Body: { sessionId, projectId }
 *
 * Verifies the Stripe/mock checkout session is paid, then activates the unlock.
 * Called by the success page after redirect from Stripe Checkout.
 */
module.exports = (router, ctx) => {
  const { auth, mysqlQuery, payments } = ctx;
  const log = ctx.log || console;
  const TAG = "[activate-unlock]";

  router.post("/payments/activate-unlock", auth, async (req, res) => {
    const uid = req.user?.uid;
    const { sessionId, projectId } = req.body || {};
    const pid = Number(projectId);

    if (!uid) return res.status(401).json({ error: "unauthorized" });
    if (!sessionId) return res.status(400).json({ error: "sessionId required" });
    if (!pid || !Number.isFinite(pid)) return res.status(400).json({ error: "projectId required" });

    try {
      // Verify session exists and belongs to this user
      const session = await payments.getSession(sessionId);
      if (!session) {
        // For Stripe, the session might not be in our DB — check Stripe directly
        if (payments.isStripe) {
          const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
          try {
            const stripeSession = await stripe.checkout.sessions.retrieve(sessionId);
            if (stripeSession.payment_status !== "paid") {
              return res.status(400).json({ error: "payment_not_completed" });
            }
            if (stripeSession.metadata?.buyerUid !== uid) {
              return res.status(403).json({ error: "forbidden" });
            }
          } catch {
            return res.status(404).json({ error: "session_not_found" });
          }
        } else {
          return res.status(404).json({ error: "session_not_found" });
        }
      } else if (session.userId && session.userId !== uid) {
        return res.status(403).json({ error: "forbidden" });
      }

      // Check if already unlocked
      const existing = await mysqlQuery(
        "SELECT id FROM project_contact_unlocks WHERE project_id = ? AND buyer_uid = ? AND status = 'active'",
        [pid, uid]
      );
      if (existing.length > 0) {
        return res.json({ ok: true, alreadyActive: true });
      }

      // Get the price from the checkout endpoint default
      const amount = Number(process.env.ONEOFF_UNLOCK_PRICE_PENCE) || 999;

      // Activate the unlock
      await mysqlQuery(
        `INSERT INTO project_contact_unlocks
          (project_id, buyer_uid, session_id, amount, currency, status, created_at, approved_at)
         VALUES (?, ?, ?, ?, 'GBP', 'active', NOW(), NOW())
         ON DUPLICATE KEY UPDATE status = 'active', approved_at = NOW()`,
        [pid, uid, sessionId, amount]
      );

      // Record payment
      await mysqlQuery(
        `INSERT INTO payments_oneoff
          (user_id, type, entity_id, amount, currency, status, provider_session_id, created_at)
         SELECT ?, 'unlock_contact', ?, ?, 'GBP', 'active', ?, NOW()
         FROM DUAL WHERE NOT EXISTS (
           SELECT 1 FROM payments_oneoff WHERE user_id = ? AND type = 'unlock_contact' AND entity_id = ?
         )`,
        [uid, pid, amount, sessionId, uid, pid]
      );

      log.info?.({ uid, pid, sessionId }, `${TAG} unlock activated`);
      ctx.logActivity?.("payment.unlock", "info", uid, `Unlock activated for project #${pid}`);

      // Insert inbox_messages row so the homeowner sees the profile share + builder intro.
      // Guarded to only fire for unlock_contact sessions.
      try {
        const vmbType =
          session?.metadata?.vmb_type || session?.metadata?.type || "";
        if (vmbType === "unlock_contact") {
          const introMessage = session.metadata?.introMessage || "";
          const pRows = await mysqlQuery(
            `SELECT ownerUserId FROM projects WHERE id = ? LIMIT 1`,
            [pid]
          );
          const ownerUid = pRows?.[0]?.ownerUserId;
          if (ownerUid) {
            await mysqlQuery(
              `INSERT INTO inbox_messages
                 (project_id, homeowner_uid, builder_uid, intro_message, source)
               VALUES (?, ?, ?, ?, 'paid_unlock')
               ON DUPLICATE KEY UPDATE
                 intro_message = VALUES(intro_message),
                 updated_at = NOW()`,
              [pid, ownerUid, uid, introMessage]
            );
          }
        }
      } catch (e) {
        (log?.warn || console.warn)(
          { err: e?.message },
          `${TAG} inbox_messages insert failed`
        );
      }

      res.json({ ok: true });
    } catch (err) {
      log.error?.({ err: err?.message }, `${TAG} failed`);
      res.status(500).json({ error: "server_error" });
    }
  });
};
