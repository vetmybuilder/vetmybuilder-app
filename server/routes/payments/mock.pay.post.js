// server/routes/payments/mock.pay.post.js
//
// FINAL MOCK PAYMENT FLOW (Option B – Clean, Simple)
//
// Creates INTENT ONLY → always pending_admin.
// Admin must approve later. No entitlements are activated here.

module.exports = (router, ctx) => {
  const { auth, payments, mysqlQuery } = ctx;
  const { logger, withRequest } = require("../../lib/logger");

  if (!payments) throw new Error("payments not attached to ctx");
  if (!mysqlQuery) throw new Error("mysqlQuery not attached to ctx");

  function resolveSessionId(req) {
    return (
      req.params?.id ||
      req.body?.sessionId ||
      req.body?.session_id ||
      req.body?.id ||
      req.query?.sessionId ||
      req.query?.session_id ||
      req.query?.id ||
      ""
    );
  }

  function computeTotal(items = []) {
    let amount = 0;
    let currency = "GBP";

    for (const it of items) {
      const qty = Number.isFinite(it.quantity) ? it.quantity : 1;
      const a = Number(it?.price?.amount || 0);
      amount += a * qty;
      currency = it?.price?.currency
        ? it.price.currency.toUpperCase()
        : currency;
    }

    return { amount, currency };
  }

  async function handle(req, res) {
    const log = withRequest(req, logger).child({
      route: "POST /api/payments/mock/pay",
    });

    try {
      const uid = req.user?.uid;
      if (!uid) {
        log.warn("Unauthorized request");
        return res.status(401).json({ error: "unauthorized" });
      }

      const sid = String(resolveSessionId(req));
      if (!sid) {
        log.warn("Missing sessionId");
        return res.status(400).json({ error: "sessionId_required" });
      }

      const s = await payments.getSession(sid);
      if (!s) {
        log.warn({ sid }, "Payment session not found");
        return res.status(404).json({ error: "session_not_found" });
      }

      if (s.userId !== uid) {
        log.warn(
          { sid, owner: s.userId, requester: uid },
          "User attempted to pay for session they do not own"
        );
        return res.status(403).json({ error: "forbidden" });
      }

      const md = s.metadata || {};
      const { amount, currency } = computeTotal(s.items || []);

      const type = String(
        md.type || md.vmb_type || md.kind || ""
      ).toLowerCase();
      const planId = String(md.planId || md.plan_id || "").toLowerCase();

      log.info(
        { sid, type, planId, amount, currency },
        "Processing mock payment"
      );

      // =====================================================================
      // UNLOCK CONTACT — one off per project
      // =====================================================================
      if (type === "unlock_contact") {
        const projectId = Number(md.projectId || md.project_id);
        if (!Number.isFinite(projectId) || projectId <= 0) {
          log.warn({ projectId }, "Invalid projectId for unlock_contact");
          return res.status(400).json({ error: "invalid_projectId" });
        }

        log.info(
          { sid, projectId },
          "Processing unlock_contact payment"
        );

        await mysqlQuery(
          `
          INSERT INTO project_contact_unlocks
            (project_id, buyer_uid, session_id, amount, currency, status, created_at, approved_at)
          VALUES
            (?, ?, ?, ?, ?, 'active', NOW(), NOW())
          ON DUPLICATE KEY UPDATE
            session_id = VALUES(session_id),
            amount = VALUES(amount),
            currency = VALUES(currency),
            status = 'active',
            approved_at = NOW()
          `,
          [projectId, uid, sid, amount, currency]
        );

        await mysqlQuery(
          `
          INSERT INTO payments_oneoff
            (user_id, type, entity_id, amount, currency, status,
             provider_session_id, provider_payment_intent, created_at)
          VALUES
            (?, 'unlock_contact', ?, ?, ?, 'active',
             ?, CONCAT('mock:', ?), NOW())
          ON DUPLICATE KEY UPDATE
            amount = VALUES(amount),
            currency = VALUES(currency),
            status = 'active',
            provider_session_id = VALUES(provider_session_id),
            provider_payment_intent = VALUES(provider_payment_intent)
          `,
          [uid, projectId, amount, currency, sid, sid]
        );

        log.info(
          { sid, uid, projectId },
          "Unlock payment completed - contact now active"
        );

        // Create a matched swipe_interest row (source='paid_unlock') so the
        // builder lands directly in /chat/:matchId. If the metadata carried
        // an introMessage, post it as the first chat_messages row.
        try {
          const introMessage = String(md.introMessage || "").trim();
          const pRows = await mysqlQuery(
            `SELECT ownerUserId FROM projects WHERE id = ? LIMIT 1`,
            [projectId]
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
              [projectId, ownerUid, uid]
            );

            // INSERT ... ON DUPLICATE KEY UPDATE returns insertId=0 on update;
            // look the row up by the unique pair in that case.
            let matchId = result?.insertId || 0;
            if (!matchId) {
              const m = await mysqlQuery(
                `SELECT id FROM swipe_interest
                  WHERE project_id = ? AND builder_uid = ?
                  LIMIT 1`,
                [projectId, uid]
              );
              matchId = m?.[0]?.id || 0;
            }

            if (matchId && introMessage) {
              await mysqlQuery(
                `INSERT INTO chat_messages (match_id, sender_uid, body, created_at)
                 VALUES (?, ?, ?, NOW())`,
                [matchId, uid, introMessage]
              );
            }

            // Notify the homeowner that there's a new chat to read.
            if (matchId) {
              try {
                const linkPath = `/chat/${matchId}`;
                const notifMessage = `New message - paid unlock`;
                await mysqlQuery(
                  `INSERT INTO notifications (userId, type, message, projectId, linkPath, createdAt)
                   VALUES (?, 'chat_message_new', ?, ?, ?, NOW())`,
                  [ownerUid, notifMessage, projectId, linkPath]
                );
                ctx.broadcastNotification?.(ownerUid, {
                  type: "chat_message_new",
                  message: notifMessage,
                  projectId,
                  linkPath,
                });
              } catch (notifErr) {
                log.warn({ err: notifErr?.message }, "chat_message_new notification failed in mock.pay");
              }
            }
          }
        } catch (e) {
          log.warn({ err: e?.message }, "paid_unlock match/chat insert failed in mock.pay");
        }

        res.json({
          ok: true,
          type: "unlock_contact",
          status: "active",
          projectId,
          amount,
          currency,
          sessionId: sid,
        });
        ctx.logActivity("payment.complete", "info", req.user?.uid || "system", "Payment completed");
        return;
      }

      // =====================================================================
      // SPOTLIGHT — one-off upgrade
      // =====================================================================
      if (planId === "spotlight") {
        log.info({ sid }, "Creating pending_admin spotlight intent");

        await mysqlQuery(
          `
          INSERT INTO payments_oneoff
            (user_id, type, amount, currency, status,
             provider_session_id, provider_payment_intent, created_at)
          VALUES
            (?, 'spotlight', ?, ?, 'pending_admin',
             ?, CONCAT('mock:', ?), NOW())
          ON DUPLICATE KEY UPDATE
            amount = VALUES(amount),
            currency = VALUES(currency),
            status = 'pending_admin',
            provider_session_id = VALUES(provider_session_id),
            provider_payment_intent = VALUES(provider_payment_intent)
          `,
          [uid, amount, currency, sid, sid]
        );

        await mysqlQuery(
          `UPDATE tradesmen SET purchased_plan = 'spotlight', updated_at = NOW()
           WHERE user_id = ?`,
          [uid]
        );

        log.info({ sid, uid }, "Spotlight purchase recorded as pending_admin");

        res.json({
          ok: true,
          type: "spotlight",
          status: "pending_admin",
          amount,
          currency,
          sessionId: sid,
        });
        ctx.logActivity("payment.complete", "info", req.user?.uid || "system", "Payment completed");
        return;
      }

      // =====================================================================
      // GOLD SUBSCRIPTION (recurring)
      // =====================================================================
      if (type === "subscription" || planId === "gold") {
        const plan = planId || "gold";

        log.info({ sid, plan }, "Creating pending_admin subscription intent");

        await mysqlQuery(
          `
          INSERT INTO payments_subscription
            (buyer_uid, plan_id, amount, currency, status,
             provider_session_id, provider_payment_intent, created_at)
          VALUES
            (?, ?, ?, ?, 'pending_admin',
             ?, CONCAT('mock:', ?), NOW())
          ON DUPLICATE KEY UPDATE
            plan_id = VALUES(plan_id),
            amount  = VALUES(amount),
            currency = VALUES(currency),
            status = 'pending_admin',
            provider_session_id = VALUES(provider_session_id),
            provider_payment_intent = VALUES(provider_payment_intent)
          `,
          [uid, plan, amount, currency, sid, sid]
        );

        await mysqlQuery(
          `UPDATE tradesmen SET purchased_plan = ?, updated_at = NOW()
           WHERE user_id = ?`,
          [plan, uid]
        );

        log.info({ sid, uid, plan }, "Subscription stored as pending_admin");

        res.json({
          ok: true,
          type: "subscription",
          plan,
          status: "pending_admin",
          amount,
          currency,
          sessionId: sid,
        });
        ctx.logActivity("payment.complete", "info", req.user?.uid || "system", "Payment completed");
        return;
      }

      // =====================================================================
      // FALLBACK — unknown type
      // =====================================================================
      log.warn({ sid, type, planId }, "Unhandled payment type");

      res.json({
        ok: true,
        type: "unknown",
        sessionId: sid,
        note: "Unhandled payment type",
      });
      ctx.logActivity("payment.complete", "info", req.user?.uid || "system", "Payment completed");
      return;
    } catch (e) {
      log.error(
        { errMsg: e?.message, stack: e?.stack },
        "Unexpected error processing mock payment"
      );

      return res.status(500).json({
        error: "server_error",
        message: e?.message || "Unexpected error",
      });
    }
  }

  router.post("/payments/mock/:id/pay", auth, handle);
  router.post("/payments/mock/pay", auth, handle);
};
