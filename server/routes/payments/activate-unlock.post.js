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
        // Already-active path: surface the matched swipe_interest id (if one
        // was created at first activation) so the client can route to chat.
        const m = await mysqlQuery(
          `SELECT id FROM swipe_interest
            WHERE project_id = ? AND builder_uid = ? AND source = 'paid_unlock'
            LIMIT 1`,
          [pid, uid]
        );
        const existingMatchId = m?.[0]?.id || null;
        return res.json({ ok: true, alreadyActive: true, matchId: existingMatchId });
      }

      // Get the price from the checkout endpoint default
      const amount = Number(process.env.ONEOFF_UNLOCK_PRICE_PENCE) || 999;

      // Activate the unlock
      const { REFUND_POLICY_VERSION } = require("../../lib/payments/refundPolicyVersion");
      await mysqlQuery(
        `INSERT INTO project_contact_unlocks
          (project_id, buyer_uid, session_id, amount, currency, status,
           waiver_accepted_at, waiver_policy_version,
           created_at, approved_at)
         VALUES (?, ?, ?, ?, 'GBP', 'active', NOW(), ?, NOW(), NOW())
         ON DUPLICATE KEY UPDATE
           status = 'active',
           approved_at = NOW(),
           waiver_accepted_at = COALESCE(waiver_accepted_at, NOW()),
           waiver_policy_version = COALESCE(waiver_policy_version, VALUES(waiver_policy_version))`,
        [pid, uid, sessionId, amount, REFUND_POLICY_VERSION]
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

      // Create a matched swipe_interest row (source='paid_unlock') so the
      // builder lands directly in /chat/:matchId. activate-unlock has no
      // introMessage in its metadata path, so the chat starts empty here.
      let matchId = 0;
      try {
        const pRows = await mysqlQuery(
          `SELECT ownerUserId FROM projects WHERE id = ? LIMIT 1`,
          [pid]
        );
        const ownerUid = pRows?.[0]?.ownerUserId;
        if (ownerUid) {
          const result = await mysqlQuery(
            `INSERT INTO swipe_interest
               (project_id, homeowner_uid, builder_uid, source, status,
                builder_swiped_at, created_at)
             VALUES (?, ?, ?, 'paid_unlock', 'matched', NOW(), NOW())
             ON DUPLICATE KEY UPDATE
               status = 'matched',
               source = 'paid_unlock',
               builder_swiped_at = COALESCE(builder_swiped_at, NOW())`,
            [pid, ownerUid, uid]
          );
          matchId = result?.insertId || 0;
          if (!matchId) {
            const m = await mysqlQuery(
              `SELECT id FROM swipe_interest
                WHERE project_id = ? AND builder_uid = ?
                LIMIT 1`,
              [pid, uid]
            );
            matchId = m?.[0]?.id || 0;
          }

          // Deliberately no bell notification here. A paid_unlock arrival
          // is not a chat message and was previously spamming the bell
          // with "New message - paid unlock". The homeowner sees the
          // arrival via the emerald "priority" pill on /projects (S3 in
          // the messaging model). The match itself is silent until the
          // homeowner reciprocates or the trade actually sends a chat.
        }
      } catch (e) {
        (log?.warn || console.warn)(
          { err: e?.message },
          `${TAG} paid_unlock match insert failed`
        );
      }

      res.json({ ok: true, matchId: matchId || null });
    } catch (err) {
      log.error?.({ err: err?.message }, `${TAG} failed`);
      res.status(500).json({ error: "server_error" });
    }
  });
};
