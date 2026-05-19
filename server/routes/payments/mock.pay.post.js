// server/routes/payments/mock.pay.post.js
//
// FINAL MOCK PAYMENT FLOW (Option B – Clean, Simple)
//
// Creates INTENT ONLY → always pending_admin.
// Admin must approve later. No entitlements are activated here.

const { REFUND_POLICY_VERSION } = require("../../lib/payments/refundPolicyVersion");

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
            (project_id, buyer_uid, session_id, amount, currency, status,
             waiver_accepted_at, waiver_policy_version,
             created_at, approved_at)
          VALUES
            (?, ?, ?, ?, ?, 'active', NOW(), ?, NOW(), NOW())
          ON DUPLICATE KEY UPDATE
            session_id = VALUES(session_id),
            amount = VALUES(amount),
            currency = VALUES(currency),
            status = 'active',
            approved_at = NOW(),
            waiver_accepted_at = COALESCE(waiver_accepted_at, NOW()),
            waiver_policy_version = COALESCE(waiver_policy_version, VALUES(waiver_policy_version))
          `,
          [projectId, uid, sid, amount, currency, REFUND_POLICY_VERSION]
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

        // Paid unlock = boosted slot in the homeowner's swipe deck.
        // Mirrors a trade-initiated right-swipe: row is 'pending' until the
        // homeowner reciprocates. No auto-match, no chat_messages write -
        // the homeowner has to right-swipe to form the match.
        try {
          const introMessage = String(md.introMessage || "").trim() || null;
          const pRows = await mysqlQuery(
            `SELECT ownerUserId FROM projects WHERE id = ? LIMIT 1`,
            [projectId]
          );
          const ownerUid = pRows?.[0]?.ownerUserId;
          if (ownerUid) {
            // Terminal states stay sticky via the CASE - if the homeowner
            // had already declined this trade, the row is preserved (the
            // checkout route's already-declined guard should prevent us
            // ever reaching here, but defence in depth).
            await mysqlQuery(
              `INSERT INTO swipe_interest
                 (project_id, homeowner_uid, builder_uid, source, status,
                  builder_swiped_at, intro_message, boost_expires_at, created_at)
               VALUES (?, ?, ?, 'paid_unlock', 'pending', NOW(), ?,
                       DATE_ADD(NOW(), INTERVAL 14 DAY), NOW())
               ON DUPLICATE KEY UPDATE
                 status = CASE
                   WHEN status IN ('declined_by_homeowner','declined_by_builder','matched','expired')
                     THEN status
                   ELSE 'pending'
                 END,
                 source = 'paid_unlock',
                 builder_swiped_at = COALESCE(builder_swiped_at, NOW()),
                 intro_message = COALESCE(VALUES(intro_message), intro_message),
                 boost_expires_at = VALUES(boost_expires_at)`,
              [projectId, ownerUid, uid, introMessage]
            );

            const tRows = await mysqlQuery(
              `SELECT company_name FROM tradesmen WHERE user_id = ? LIMIT 1`,
              [uid]
            );
            const companyName = tRows?.[0]?.company_name || "A tradesperson";

            try {
              // No bell notification here. A paid_unlock arrival was
              // previously firing a "paid_unlock_card" bell entry that
              // spammed the homeowner — per the agreed messaging model
              // (S3) it surfaces only as the emerald "priority" pill on
              // the /projects list. The real-time deck update below
              // still fires so an open /projects/:id page splices the
              // new card in without a refresh.
              ctx.broadcastEvent?.(ownerUid, "deck_card_added", {
                type: "deck_card_added",
                projectId,
                builderUid: uid,
              });
            } catch (notifErr) {
              log.warn({ err: notifErr?.message }, "paid_unlock deck update failed");
            }
          }
        } catch (e) {
          log.warn({ err: e?.message }, "paid_unlock swipe_interest insert failed");
        }

        // Bilateral check: if the homeowner had already right-swiped this
        // trade BEFORE the paid unlock (i.e. the row arrived from the
        // /tradesman/leads queue), the unlock completes the mutual
        // consent and we should advance to matched + fire match-formed
        // notifications. Without this the trade lands on the standard
        // "interest sent" boost-slot screen even though there's already
        // a chat-ready match waiting on the other side.
        let matchId = null;
        let bilateralMatched = false;
        try {
          const siRows = await mysqlQuery(
            `SELECT id, status, homeowner_swiped_at
               FROM swipe_interest
              WHERE project_id = ? AND builder_uid = ?
              LIMIT 1`,
            [projectId, uid],
          );
          const si = siRows?.[0];
          if (si) {
            matchId = si.id;
            const homeownerAlreadySwiped =
              si.homeowner_swiped_at != null && si.status === "pending";
            if (homeownerAlreadySwiped) {
              await mysqlQuery(
                `UPDATE swipe_interest
                    SET status = 'matched'
                  WHERE id = ?`,
                [si.id],
              );
              bilateralMatched = true;
              try {
                const { fireMatchFormed } = require("../../lib/fireMatchFormed");
                await fireMatchFormed({ projectId, mysqlQuery, ctx });
              } catch (e) {
                log.warn(
                  { err: e?.message },
                  "fireMatchFormed (bilateral paid unlock) failed",
                );
              }
            }
          }
        } catch (e) {
          log.warn({ err: e?.message }, "bilateral-match check failed");
        }

        res.json({
          ok: true,
          type: "unlock_contact",
          status: "active",
          projectId,
          amount,
          currency,
          sessionId: sid,
          // When the homeowner had already swiped right, the unlock
          // forms a mutual match: client can route straight to chat
          // instead of the boost-slot "Interest sent" screen.
          matched: bilateralMatched,
          matchId,
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
             provider_session_id, provider_payment_intent,
             waiver_accepted_at, waiver_policy_version, created_at)
          VALUES
            (?, ?, ?, ?, 'pending_admin',
             ?, CONCAT('mock:', ?),
             NOW(), ?, NOW())
          ON DUPLICATE KEY UPDATE
            plan_id = VALUES(plan_id),
            amount  = VALUES(amount),
            currency = VALUES(currency),
            status = 'pending_admin',
            provider_session_id = VALUES(provider_session_id),
            provider_payment_intent = VALUES(provider_payment_intent),
            waiver_accepted_at = COALESCE(waiver_accepted_at, NOW()),
            waiver_policy_version = COALESCE(waiver_policy_version, VALUES(waiver_policy_version))
          `,
          [uid, plan, amount, currency, sid, sid, REFUND_POLICY_VERSION]
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
