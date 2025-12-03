// server/routes/admin/subscriptions.cancel.post.js
//
// ADMIN — Cancel GOLD subscription (period-end or immediate)
//
// Keep both routes:
//   POST /admin/subscriptions/:userId/cancel
//   POST /admin/tradesmen/:userId/subscription/cancel
//
// Only GOLD exists. No platinum.
//

module.exports = (router, ctx) => {
  const { db, auth, mysqlQuery } = ctx;
  if (!db && !mysqlQuery)
    throw new Error("db or mysqlQuery not attached to ctx");

  const log = ctx.log || console;

  const hasMysql = typeof mysqlQuery === "function";
  const isBetter = !!db?.prepare;

  // ---------- tiny dialect helpers ----------
  const queryAll = async (sql, params = []) => {
    if (hasMysql) return mysqlQuery(sql, params);
    if (isBetter) return db.prepare(sql).all(...[].concat(params));
    const [rows] = await db.execute(sql, params);
    return rows;
  };

  const queryOne = async (sql, params = []) => {
    const rows = await queryAll(sql, params);
    return rows?.[0] || null;
  };

  const run = async (sql, params = []) => {
    if (hasMysql) return mysqlQuery(sql, params);
    if (isBetter) return db.prepare(sql).run(...[].concat(params));
    const [res] = await db.execute(sql, params);
    return res;
  };

  const beginTx = () => {
    if (!hasMysql && db?.exec) db.exec("BEGIN");
  };
  const commitTx = () => {
    if (!hasMysql && db?.exec) db.exec("COMMIT");
  };
  const rollbackTx = () => {
    if (!hasMysql && db?.exec) db.exec("ROLLBACK");
  };

  // ---------- Admin Guard ----------
  const requireAdmin =
    ctx.requireAdmin ||
    (async (req, res, next) => {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" });

      let roleRow = null;
      try {
        roleRow = await queryOne(`SELECT role FROM user_roles WHERE uid = ?`, [
          req.user.uid,
        ]);
      } catch (_) {}

      const role = String(roleRow?.role || "user").toLowerCase();

      const allowlist = (process.env.ADMIN_EMAILS || "")
        .split(",")
        .map((x) => x.trim().toLowerCase())
        .filter(Boolean);

      const email = String(req.user?.email || "")
        .trim()
        .toLowerCase();

      const isAdmin = role === "admin" || (email && allowlist.includes(email));

      if (!isAdmin) return res.status(403).json({ error: "Forbidden" });
      next();
    });

  // ---------- Ensure audit table ----------
  async function ensureSchema() {
    try {
      if (hasMysql) {
        await run(`
          CREATE TABLE IF NOT EXISTS subscriptions_history (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            user_id VARCHAR(255) NOT NULL,
            event VARCHAR(64) NOT NULL,
            from_status VARCHAR(64),
            to_status VARCHAR(64),
            from_plan VARCHAR(64),
            to_plan VARCHAR(64),
            purchased_plan VARCHAR(64),
            actor VARCHAR(255),
            reason TEXT,
            at DATETIME NOT NULL
          )
        `);
      } else {
        await run(`
          CREATE TABLE IF NOT EXISTS subscriptions_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            event TEXT NOT NULL,
            from_status TEXT,
            to_status TEXT,
            from_plan TEXT,
            to_plan TEXT,
            purchased_plan TEXT,
            actor TEXT,
            reason TEXT,
            at TEXT NOT NULL
          )
        `);
      }
    } catch (e) {
      console.warn("[admin.subscriptions.cancel] ensureSchema:", e);
    }
  }

  // ---------- Snapshot ----------
  async function getSnapshot(userId) {
    return (
      (await queryOne(
        `
        SELECT subscription_status AS status,
               plan,
               purchased_plan,
               plan_update_at,
               plan_updated_at
          FROM tradesmen
         WHERE user_id = ?
        `,
        [userId]
      )) || {
        status: null,
        plan: null,
        purchased_plan: null,
        plan_update_at: null,
        plan_updated_at: null,
      }
    );
  }

  // ---------- Find latest GOLD subscription ----------
  async function getLatestGoldSub(userId, statuses) {
    if (!statuses.length) return null;
    const placeholders = statuses.map(() => "?").join(",");

    return await queryOne(
      `
      SELECT *
        FROM payments_subscription
       WHERE buyer_uid = ?
         AND plan_id = 'gold'
         AND status IN (${placeholders})
       ORDER BY created_at DESC
       LIMIT 1
      `,
      [userId, ...statuses]
    );
  }

  // ---------- Audit log ----------
  async function audit(evt) {
    await run(
      `
      INSERT INTO subscriptions_history
        (user_id, event,
         from_status, to_status,
         from_plan, to_plan,
         purchased_plan, actor, reason, at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        evt.userId,
        evt.event,
        evt.from_status,
        evt.to_status,
        evt.from_plan,
        evt.to_plan,
        evt.purchased_plan,
        evt.actor,
        evt.reason || null,
        new Date().toISOString(),
      ]
    );
  }

  function isoNow() {
    return new Date().toISOString();
  }

  function add1Month(iso) {
    const d = new Date(iso || Date.now());
    d.setMonth(d.getMonth() + 1);
    return d.toISOString();
  }

  // ---------- Main handler ----------
  async function handleAdminCancel(req, res) {
    await ensureSchema();

    const userId = String(req.params.userId || "");
    if (!userId) return res.status(400).json({ error: "userId required" });

    const immediate = !!req.body?.immediate;
    const reason = req.body?.reason || null;
    const actor = req.user?.email || req.user?.uid;

    const before = await getSnapshot(userId);
    if (!before) return res.status(404).json({ error: "User not found" });

    // IMPORTANT:
    // Cancel any GOLD subscription in status:
    //   succeeded, active, trialing, canceled_pending
    const cancellable = ["succeeded", "active", "trialing", "canceled_pending"];

    const sub = await getLatestGoldSub(userId, cancellable);
    if (!sub) {
      return res.status(404).json({
        error: "no_subscription",
        hint: "No GOLD subscription found in cancellable state",
      });
    }

    const now = isoNow();

    try {
      beginTx();

      let payload = null;

      if (immediate) {
        // Immediate: end benefits now
        await run(
          `UPDATE payments_subscription SET status = 'canceled' WHERE id = ?`,
          [sub.id]
        );

        await run(
          `
          UPDATE tradesmen
             SET plan                = 'free',
                 purchased_plan      = NULL,
                 subscription_status = 'canceled',
                 plan_update_at      = NULL,
                 plan_updated_at     = ?,
                 updated_at          = ?
           WHERE user_id = ?
        `,
          [now, now, userId]
        );

        await audit({
          userId,
          event: "admin_cancel_now",
          from_status: before.status,
          to_status: "canceled",
          from_plan: before.plan,
          to_plan: "free",
          purchased_plan: before.purchased_plan,
          actor,
          reason,
        });

        payload = {
          ok: true,
          user_id: userId,
          status: "canceled",
          plan: "free",
          immediate: true,
          subscription_id: sub.id,
          canceled_at: now,
        };
      } else {
        // Period end: mark canceled_pending, keep benefits until next renewal
        const cancelAtISO =
          before.plan_update_at ||
          before.plan_updated_at ||
          add1Month(sub.created_at);

        await run(
          `UPDATE payments_subscription SET status = 'canceled_pending' WHERE id = ?`,
          [sub.id]
        );

        await run(
          `
          UPDATE tradesmen
             SET subscription_status = 'canceled_pending',
                 plan_update_at      = ?,
                 plan_updated_at     = ?,
                 updated_at          = ?
           WHERE user_id = ?
        `,
          [cancelAtISO, now, now, userId]
        );

        await audit({
          userId,
          event: "admin_cancel",
          from_status: before.status,
          to_status: "canceled_pending",
          from_plan: before.plan,
          to_plan: before.plan || "gold",
          purchased_plan: before.purchased_plan,
          actor,
          reason,
        });

        payload = {
          ok: true,
          user_id: userId,
          status: "canceled_pending",
          plan: before.plan || "gold",
          cancel_at: cancelAtISO,
          subscription_id: sub.id,
        };
      }

      commitTx();

      // Best-effort SSE
      try {
        ctx.sseSend?.(userId, {
          type: "plan.updated",
          ...payload,
        });
      } catch (_) {}

      return res.json(payload);
    } catch (e) {
      rollbackTx();
      return res.status(500).json({
        error: "internal_error",
        details: e?.message || String(e),
      });
    }
  }

  // ---------- ROUTES (KEEP BOTH) ----------
  router.post(
    "/admin/subscriptions/:userId/cancel",
    auth,
    requireAdmin,
    handleAdminCancel
  );
  router.post(
    "/admin/tradesmen/:userId/subscription/cancel",
    auth,
    requireAdmin,
    handleAdminCancel
  );

  if (!ctx.__logged_admin_subscription_cancel) {
    ctx.__logged_admin_subscription_cancel = true;
    const base = ctx.API_PREFIX || "/api";
    console.log(
      `[routes] mounted: POST ${base}/admin/subscriptions/:userId/cancel (and alias /admin/tradesmen/:userId/subscription/cancel)`
    );
  }
};
