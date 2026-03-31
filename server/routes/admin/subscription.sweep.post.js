//
// Admin-only: finalize pending subscription cancellations.
// Any tradesman with `subscription_status = 'canceled_pending'` where
// plan_update_at (or plan_updated_at) <= now will be downgraded to 'free',
// and their latest pending Gold subscription will be marked 'canceled'.
//

const { logger, withRequest } = require("../../lib/logger");

module.exports = (router, ctx) => {
  const { auth, mysqlQuery } = ctx;
  if (!mysqlQuery) {
    throw new Error("mysqlQuery not attached to ctx");
  }

  const TAG = "admin.subscriptions.sweep";

  const all = async (sql, params = []) =>
    (await mysqlQuery(sql, params)) || [];

  const get = async (sql, params = []) => {
    const rows = await all(sql, params);
    return rows?.[0] || null;
  };

  const run = async (sql, params = []) => mysqlQuery(sql, params);

  // ---- admin guard ----
  const requireAdmin =
    ctx.requireAdmin ||
    (async (req, res, next) => {
      const log = withRequest(req).child({ route: TAG });

      try {
        if (!req.user)
          return res.status(401).json({ error: "Unauthorized" });

        const uid = req.user.uid;

        let roleRow = null;
        try {
          roleRow = await get(
            `SELECT role FROM user_roles WHERE uid = ? LIMIT 1`,
            [uid]
          );
        } catch (e) {
          log.warn(
            { err: e?.message, uid },
            "Role lookup failed in requireAdmin"
          );
        }

        const role = String(roleRow?.role || "user").toLowerCase();
        const allowlist = (process.env.ADMIN_EMAILS || "")
          .split(",")
          .map((s) => s.trim().toLowerCase())
          .filter(Boolean);

        const email = String(req.user?.email || "")
          .trim()
          .toLowerCase();
        const isAdmin =
          role === "admin" || (email && allowlist.includes(email));

        if (!isAdmin) {
          log.warn({ uid, email }, "Forbidden: user not admin");
          return res.status(403).json({ error: "Forbidden" });
        }

        next();
      } catch (e) {
        logger.error(
          { route: TAG, err: e?.message, stack: e?.stack },
          "requireAdmin error"
        );
        return res.status(500).json({ error: "internal_error" });
      }
    });

  // ---- audit table creation ----
  let schemaEnsured = false;

  async function ensureSchema() {
    if (schemaEnsured) return;

    await run(`
      CREATE TABLE IF NOT EXISTS subscriptions_history (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        user_id VARCHAR(191) NOT NULL,
        event VARCHAR(64) NOT NULL,
        from_status VARCHAR(64),
        to_status   VARCHAR(64),
        from_plan   VARCHAR(64),
        to_plan     VARCHAR(64),
        purchased_plan VARCHAR(64),
        actor VARCHAR(191),
        reason TEXT,
        at DATETIME NOT NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    schemaEnsured = true;
  }

  async function audit(record) {
    const {
      userId,
      event,
      from_status,
      to_status,
      from_plan,
      to_plan,
      purchased_plan,
      actor,
      reason,
    } = record;

    await ensureSchema();

    const sql = `
      INSERT INTO subscriptions_history
        (user_id, event,
         from_status, to_status,
         from_plan, to_plan,
         purchased_plan, actor, reason, at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const at = new Date().toISOString();

    await run(sql, [
      userId,
      event,
      from_status || null,
      to_status || null,
      from_plan || null,
      to_plan || null,
      purchased_plan ?? null,
      actor || null,
      reason || null,
      at,
    ]);
  }

  const nowISO = () => new Date().toISOString();

  async function findDue(nowIso) {
    return all(
      `
      SELECT user_id, plan, subscription_status, plan_update_at, plan_updated_at
        FROM tradesmen
       WHERE subscription_status = 'canceled_pending'
         AND (
              (plan_update_at  IS NOT NULL AND plan_update_at  <= ?)
           OR (plan_updated_at IS NOT NULL AND plan_updated_at <= ?)
         )
      `,
      [nowIso, nowIso]
    );
  }

  async function latestPendingGoldSub(uid) {
    return get(
      `
      SELECT id, status, plan_id, created_at
        FROM payments_subscription
       WHERE buyer_uid = ?
         AND plan_id   = 'gold'
         AND status    = 'canceled_pending'
       ORDER BY created_at DESC
       LIMIT 1
      `,
      [uid]
    );
  }

  async function finalizeUser(uid, before, nowIso, log) {
    const sub = await latestPendingGoldSub(uid);

    if (sub) {
      await run(
        `UPDATE payments_subscription SET status = 'canceled' WHERE id = ?`,
        [sub.id]
      );
    }

    await run(
      `
      UPDATE tradesmen
         SET plan                = 'free',
             purchased_plan      = NULL,
             subscription_status = 'canceled',
             plan_update_at      = NULL,
             plan_updated_at     = ?
       WHERE user_id = ?
      `,
      [nowIso, uid]
    );

    await audit({
      userId: uid,
      event: "sweep_finalize",
      from_status: before.subscription_status,
      to_status: "canceled",
      from_plan: before.plan,
      to_plan: "free",
      purchased_plan: null,
      actor: "admin_sweep",
      reason: "auto finalize at period end",
    });

    log.info({ uid, subscriptionId: sub?.id }, "Subscription sweep finalized");

    return {
      user_id: uid,
      subscription_id: sub?.id || null,
      finalized_at: nowIso,
    };
  }

  async function simulateFinalizeUser(uid) {
    const sub = await latestPendingGoldSub(uid);
    return { user_id: uid, subscription_id: sub?.id || null, simulated: true };
  }

  // ---- handler ----
  async function handleSweep(req, res) {
    const log = withRequest(req).child({ route: TAG });
    const nowIso = nowISO();
    const dryRun = !!req.body?.dryRun;
    const actor = req.user?.email || req.user?.uid || "admin";

    try {
      await ensureSchema();

      const due = await findDue(nowIso);
      if (!due || due.length === 0) {
        log.info("No subscriptions due for sweep");
        return res.json({ ok: true, processed: 0, users: [] });
      }

      if (dryRun) {
        const simulated = [];
        for (const row of due) {
          simulated.push(await simulateFinalizeUser(row.user_id));
        }

        log.info(
          { count: simulated.length },
          "Dry-run sweep simulation completed"
        );

        return res.json({
          ok: true,
          dryRun: true,
          would_process: simulated.length,
          users: simulated,
        });
      }

      // Process sequentially
      const processed = [];
      for (const row of due) {
        processed.push(
          await finalizeUser(row.user_id, row, nowIso, log)
        );
      }

      // Optional SSE notify
      try {
        if (typeof ctx.sseSend === "function") {
          for (const p of processed) {
            ctx.sseSend(p.user_id, {
              type: "plan.updated",
              plan: "free",
              subscription_status: "canceled",
              at: nowIso,
              by: actor,
            });
          }
        }
      } catch (_) {
        // Non-fatal
      }

      log.info(
        { processed: processed.length },
        "Subscription sweep completed"
      );

      return res.json({
        ok: true,
        processed: processed.length,
        users: processed,
      });
    } catch (e) {
      logger.error(
        { route: TAG, err: e?.message, stack: e?.stack },
        "Sweep failed"
      );

      return res.status(500).json({
        error: "internal_error",
        details: e?.message || String(e),
      });
    }
  }

  // ---- mount routes ----
  router.post("/admin/subscriptions/sweep", auth, requireAdmin, handleSweep);
  router.post(
    "/admin/tradesmen/subscriptions/sweep",
    auth,
    requireAdmin,
    handleSweep
  );
};
