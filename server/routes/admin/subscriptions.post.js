//
// POST /api/admin/subscriptions
//
// Admin approves / activates:
//   - Gold (subscription)
//   - Spotlight (one-off timed)
//   - Unlock Contact (one-off per project)
//   - Free → no-op
//
// Responsible for:
//   1. Reading the pending payment session
//   2. Validating plan type
//   3. Updating the tradesman record
//   4. Writing entitlement rows (spotlight/unlocks)
//   5. Marking payment as “active”
//

module.exports = (router, ctx) => {
  const { auth, mysqlQuery } = ctx;
  const { PLANS } = require("../../../shared/config/plans");

  const API_BASE = ctx.API_PREFIX || "/api";
  const PATH = "/admin/subscriptions";

  // ------------ Admin Gate ------------
  async function isAdmin(req) {
    const uid = req.user?.uid;
    if (!uid) return false;

    try {
      const rows = await mysqlQuery(
        `SELECT role FROM user_roles WHERE uid = ? LIMIT 1`,
        [uid]
      );
      if (!rows.length) return false;
      return rows[0].role === "admin";
    } catch (e) {
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

  router.post(PATH, auth, async (req, res) => {
    try {
      if (!(await isAdmin(req))) {
        return res.status(403).json({
          error: "forbidden",
          details: "Admin role required",
        });
      }

      const { userId, sessionId } = req.body;
      if (!userId || !sessionId) {
        return res.status(400).json({ error: "missing_parameters" });
      }

      // 1) Load payment session
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
        return res.status(404).json({ error: "session_not_found" });
      }

      const planId = session.plan_id;
      const plan = getPlan(planId);

      if (!plan) {
        return res.status(400).json({ error: "invalid_plan" });
      }

      const planType = plan.type; // "one_off" | "subscription"
      const isUnlock = plan.id === "unlock_contact";
      const isSpotlight = plan.id === "spotlight";
      const isGold = plan.id === "gold";

      // Validate required metadata
      const projectId = session.entity_id || null;

      // 2) Approve the payment session
      await mysqlQuery(
        `
        UPDATE payments_oneoff
        SET status = 'active', activated_at = ?
        WHERE id = ?
        `,
        [now(), session.id]
      );

      // 3) Process entitlement based on plan type
      // ---------------------------------------------------------
      // GOLD (subscription)
      // ---------------------------------------------------------
      if (isGold) {
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

        return res.json({
          ok: true,
          message: "Gold subscription activated",
          userId,
          plan: "gold",
        });
      }

      // ---------------------------------------------------------
      // SPOTLIGHT (one-off), duration in days, timed expiry
      // ---------------------------------------------------------
      if (isSpotlight) {
        const duration = Number(plan.durationDays || 30);
        const start = now();
        const expiry = new Date(Date.now() + duration * 86400 * 1000)
          .toISOString()
          .slice(0, 19)
          .replace("T", " ");

        await mysqlQuery(
          `
          INSERT INTO tradesmen_spotlights
          (user_id, started_at, expires_at, session_id)
          VALUES (?, ?, ?, ?)
          `,
          [userId, start, expiry, sessionId]
        );

        return res.json({
          ok: true,
          message: "Spotlight activated",
          userId,
          expires_at: expiry,
        });
      }

      // ---------------------------------------------------------
      // UNLOCK CONTACT (per project)
      // ---------------------------------------------------------
      if (isUnlock) {
        if (!projectId) {
          return res.status(400).json({
            error: "missing_project_id_for_unlock_contact",
          });
        }

        // Insert entitlement
        await mysqlQuery(
          `
          INSERT INTO project_contact_unlocks
          (user_id, project_id, session_id, unlocked_at)
          VALUES (?, ?, ?, ?)
          `,
          [userId, projectId, sessionId, now()]
        );

        return res.json({
          ok: true,
          message: "Contact unlocked for project",
          userId,
          projectId,
        });
      }

      // ---------------------------------------------------------
      // FREE → NO-OP
      // ---------------------------------------------------------
      if (plan.id === "free") {
        return res.json({
          ok: true,
          note: "Free plan requires no admin action",
        });
      }

      return res.json({
        ok: true,
        message: `Plan '${planId}' activated`,
      });
    } catch (e) {
      console.error("[admin/subscriptions.post] error", e);
      return res.status(500).json({
        error: "server_error",
        detail: e?.message,
      });
    }
  });

  if (!ctx.__logged_admin_subscriptions_post) {
    ctx.__logged_admin_subscriptions_post = true;
    console.log(`[routes] mounted: POST ${API_BASE}${PATH}`);
  }
};
