//
// POST /api/admin/subscriptions
//
// Admin activates one-off or subscription plans:
//
//   - Gold (subscription)
//   - Spotlight (one-off timed)
//   - Unlock Contact (one-off per project)
//   - Free → no-op
//
// Responsible for:
//   1. Reading pending payment session
//   2. Validating plan type
//   3. Updating tradesman record
//   4. Writing entitlement rows
//   5. Marking payment as “active”
//

const { logger, withRequest } = require("../../lib/logger");

module.exports = (router, ctx) => {
  const { auth, mysqlQuery } = ctx;
  const { PLANS } = require("../../../shared/config/plans");

  const API_BASE = ctx.API_PREFIX || "/api";
  const PATH = "/admin/subscriptions";

  // ------------ Admin Gate ------------
  async function isAdmin(req, log) {
    const uid = req.user?.uid;
    if (!uid) {
      log.warn("Admin check failed: no uid");
      return false;
    }

    try {
      const rows = await mysqlQuery(
        `SELECT role FROM user_roles WHERE uid = ? LIMIT 1`,
        [uid]
      );
      const ok = rows.length && rows[0].role === "admin";

      if (!ok) log.warn({ uid }, "Admin check failed");
      return ok;
    } catch (e) {
      log.error({ err: e?.message }, "Admin lookup error");
      return false;
    }
  }

  // ------------ Helpers ------------
  function getPlan(planId) {
    return PLANS.plans.find((p) => p.id === planId) || null;
  }

  function now() {
    return new Date().toISOString().slice(0, 19).replace("T", " ");
  }

  // ------------ Main Route ------------
  router.post(PATH, auth, async (req, res) => {
    const log = withRequest(req).child({
      route: "admin/subscriptions.post",
      bodyUserId: req.body?.userId,
      bodySessionId: req.body?.sessionId,
    });

    try {
      if (!(await isAdmin(req, log))) {
        log.warn("Forbidden: not admin");
        return res.status(403).json({
          error: "forbidden",
          details: "Admin role required",
        });
      }

      const { userId, sessionId } = req.body;
      if (!userId || !sessionId) {
        log.warn("Missing parameters");
        return res.status(400).json({ error: "missing_parameters" });
      }

      // ---- Load payment session ----
      const [session] = await mysqlQuery(
        `
        SELECT *
        FROM payments_oneoff
        WHERE session_id = ?
          AND user_id = ?
        LIMIT 1
        `,
        [sessionId, userId]
      );

      if (!session) {
        log.warn({ userId, sessionId }, "Payment session not found");
        return res.status(404).json({ error: "session_not_found" });
      }

      const planId = session.plan_id;
      const plan = getPlan(planId);

      if (!plan) {
        log.warn({ planId }, "Invalid plan");
        return res.status(400).json({ error: "invalid_plan" });
      }

      const planType = plan.type; // one_off | subscription
      const isUnlock = plan.id === "unlock_contact";
      const isSpotlight = plan.id === "spotlight";
      const isGold = plan.id === "gold";
      const projectId = session.entity_id || null;

      // ---- Mark payment session active ----
      await mysqlQuery(
        `
        UPDATE payments_oneoff
        SET status = 'active', activated_at = ?
        WHERE id = ?
      `,
        [now(), session.id]
      );

      log.info({ userId, sessionId, planId }, "Payment session activated");

      // ---------------------------------------------------------
      // GOLD — subscription plan
      // ---------------------------------------------------------
      if (isGold) {
        log.info({ userId, planId }, "Activating Gold subscription");

        await mysqlQuery(
          `
          UPDATE tradesmen
          SET plan = 'gold',
              subscription_status = 'active',
              subscription_started_at = ?,
              updated_at = ?
          WHERE user_id = ?
        `,
          [now(), now(), userId]
        );

        res.json({
          ok: true,
          message: "Gold subscription activated",
          userId,
          plan: "gold",
        });
        ctx.logActivity("admin.subscription", "info", req.user.uid, "Subscription created");
        return;
      }

      // ---------------------------------------------------------
      // SPOTLIGHT — one-off, timed expiry
      // ---------------------------------------------------------
      if (isSpotlight) {
        const duration = Number(plan.durationDays || 30);
        const start = now();
        const expiry = new Date(Date.now() + duration * 86400 * 1000)
          .toISOString()
          .slice(0, 19)
          .replace("T", " ");

        log.info(
          { userId, duration, expires_at: expiry },
          "Activating Spotlight"
        );

        await mysqlQuery(
          `
          INSERT INTO tradesmen_spotlights
          (user_id, started_at, expires_at, session_id)
          VALUES (?, ?, ?, ?)
        `,
          [userId, start, expiry, sessionId]
        );

        res.json({
          ok: true,
          message: "Spotlight activated",
          userId,
          expires_at: expiry,
        });
        ctx.logActivity("admin.subscription", "info", req.user.uid, "Subscription created");
        return;
      }

      // ---------------------------------------------------------
      // UNLOCK CONTACT — one-off per project
      // ---------------------------------------------------------
      if (isUnlock) {
        if (!projectId) {
          log.warn("Missing projectId for unlock");
          return res.status(400).json({
            error: "missing_project_id_for_unlock_contact",
          });
        }

        log.info({ userId, projectId }, "Unlocking contact for project");

        await mysqlQuery(
          `
          INSERT INTO project_contact_unlocks
          (user_id, project_id, session_id, unlocked_at)
          VALUES (?, ?, ?, ?)
        `,
          [userId, projectId, sessionId, now()]
        );

        res.json({
          ok: true,
          message: "Contact unlocked for project",
          userId,
          projectId,
        });
        ctx.logActivity("admin.subscription", "info", req.user.uid, "Subscription created");
        return;
      }

      // ---------------------------------------------------------
      // FREE — no entitlement required
      // ---------------------------------------------------------
      if (plan.id === "free") {
        log.info({ userId }, "Free plan — no admin action");
        res.json({
          ok: true,
          note: "Free plan requires no admin action",
        });
        ctx.logActivity("admin.subscription", "info", req.user.uid, "Subscription created");
        return;
      }

      // Fallback catch-all
      log.info({ userId, planId }, "Generic plan activation");
      res.json({
        ok: true,
        message: `Plan '${planId}' activated`,
      });
      ctx.logActivity("admin.subscription", "info", req.user.uid, "Subscription created");
      return;
    } catch (e) {
      const log = withRequest(req);
      log.error(
        { err: e?.message, stack: e?.stack },
        "Subscription activation failed"
      );

      return res.status(500).json({
        error: "server_error",
        detail: e?.message,
      });
    }
  });

  // ---- MOUNT LOG ----
  if (!ctx.__logged_admin_subscriptions_post) {
    ctx.__logged_admin_subscriptions_post = true;

    logger.info(
      { route: `${API_BASE}${PATH}` },
      "Mounted: POST admin/subscriptions"
    );
  }
};
