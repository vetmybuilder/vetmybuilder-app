// server/routes/payments/mock.pay.post.js
//
// FINAL MOCK PAYMENT FLOW (Option B – Clean, Simple)
//
// This endpoint:
//   ✔ Creates INTENT ONLY
//   ✔ Always sets status = 'pending_admin'
//   ✔ Does NOT grant entitlement
//   ✔ Does NOT mark as paid
//   ✔ Does NOT auto-activate anything
//
// Admin must approve in:
//   /api/admin/tradesmen/:uid/unlocks/approve       (one-off contact unlock)
//   /api/admin/tradesmen/:uid/subscription/approve  (gold subscription)
//   /api/admin/tradesmen/:uid/subscription/approve  (spotlight)
//
// Gold automatic contact access is handled in owner-contact.get.js (Step 3).
//

module.exports = (router, ctx) => {
  const { auth, payments, mysqlQuery } = ctx;
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
    try {
      const uid = req.user?.uid;
      if (!uid) return res.status(401).json({ error: "Unauthorized" });

      const sid = String(resolveSessionId(req));
      if (!sid) return res.status(400).json({ error: "sessionId required" });

      const s = payments.getSession(sid);
      if (!s) return res.status(404).json({ error: "Session not found" });
      if (s.userId !== uid) return res.status(403).json({ error: "Forbidden" });

      const md = s.metadata || {};
      const { amount, currency } = computeTotal(s.items || []);

      const type = String(
        md.type || md.vmb_type || md.kind || ""
      ).toLowerCase();
      const planId = String(md.planId || md.plan_id || "").toLowerCase();

      // =====================================================================
      // ONE-OFF CONTACT UNLOCK (free + spotlight only)
      // =====================================================================
      if (type === "unlock_contact") {
        const projectId = Number(md.projectId || md.project_id);
        if (!Number.isFinite(projectId) || projectId <= 0) {
          return res.status(400).json({ error: "Invalid projectId" });
        }

        // project_contact_unlocks → pending_admin
        await mysqlQuery(
          `
          INSERT INTO project_contact_unlocks
            (project_id, buyer_uid, session_id, amount, currency, status, created_at)
          VALUES
            (?, ?, ?, ?, ?, 'pending_admin', NOW())
          ON DUPLICATE KEY UPDATE
            session_id = VALUES(session_id),
            amount = VALUES(amount),
            currency = VALUES(currency),
            status = 'pending_admin'
          `,
          [projectId, uid, sid, amount, currency]
        );

        // payments_oneoff → pending_admin
        await mysqlQuery(
          `
          INSERT INTO payments_oneoff
            (user_id, type, entity_id, amount, currency, status,
             provider_session_id, provider_payment_intent, created_at)
          VALUES
            (?, 'unlock_contact', ?, ?, ?, 'pending_admin',
             ?, CONCAT('mock:', ?), NOW())
          ON DUPLICATE KEY UPDATE
            amount = VALUES(amount),
            currency = VALUES(currency),
            status = 'pending_admin',
            provider_session_id = VALUES(provider_session_id),
            provider_payment_intent = VALUES(provider_payment_intent)
          `,
          [uid, projectId, amount, currency, sid, sid]
        );

        return res.json({
          ok: true,
          type: "unlock_contact",
          status: "pending_admin",
          projectId,
          amount,
          currency,
          sessionId: sid,
        });
      }

      // =====================================================================
      // SPOTLIGHT (one-off, 30 days)
      // =====================================================================
      if (planId === "spotlight") {
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

        return res.json({
          ok: true,
          type: "spotlight",
          status: "pending_admin",
          amount,
          currency,
          sessionId: sid,
        });
      }

      // =====================================================================
      // GOLD SUBSCRIPTION
      // =====================================================================
      if (type === "subscription" || planId === "gold") {
        const plan = planId || "gold";

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

        return res.json({
          ok: true,
          type: "subscription",
          plan,
          status: "pending_admin",
          amount,
          currency,
          sessionId: sid,
        });
      }

      // =====================================================================
      // FALLBACK — unhandled payment type
      // =====================================================================
      return res.json({
        ok: true,
        type: "unknown",
        sessionId: sid,
        note: "Unhandled payment type",
      });
    } catch (e) {
      console.error("[mock.pay.post] error:", e);
      return res.status(500).json({
        error: "server_error",
        message: e?.message || String(e),
      });
    }
  }

  router.post("/payments/mock/:id/pay", auth, handle);
  router.post("/payments/mock/pay", auth, handle);
};
