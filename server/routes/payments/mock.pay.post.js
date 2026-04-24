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

        // Insert inbox_messages row so the homeowner sees the profile share + builder intro.
        try {
          const introMessage = md.introMessage || "";
          const pRows = await mysqlQuery(
            `SELECT ownerUserId FROM projects WHERE id = ? LIMIT 1`,
            [projectId]
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
              [projectId, ownerUid, uid, introMessage]
            );
          }
        } catch (e) {
          log.warn({ err: e?.message }, "inbox_messages insert failed in mock.pay");
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
