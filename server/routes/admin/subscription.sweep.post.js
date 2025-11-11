// server/routes/admin/subscriptions.sweep.post.js
//
// Admin-only: finalize pending subscription cancellations.
// Any tradesman with `subscription_status = 'canceled_pending'` where
// plan_update_at (or plan_updated_at) <= now will be downgraded to 'free',
// and their latest pending Gold subscription will be marked 'canceled'.
//
// Route:
//   POST /admin/subscriptions/sweep
// Alias:
//   POST /admin/tradesmen/subscriptions/sweep
//
// Body (optional):
//   { dryRun?: boolean }  // if true, returns what *would* be processed without changing data

module.exports = (router, ctx) => {
  const { db, auth } = ctx;
  if (!db) throw new Error("db not attached to ctx");

  // ---- admin guard (copy of your pattern) ----
  const requireAdmin =
    ctx.requireAdmin ||
    ((req, res, next) => {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" });

      const uid = req.user.uid;
      let roleRow = null;
      try {
        roleRow = db
          .prepare(`SELECT role FROM user_roles WHERE uid=?`)
          .get(uid);
      } catch (_) {}

      const role = String(roleRow?.role || "user").toLowerCase();

      const allowlist = (process.env.ADMIN_EMAILS || "")
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);

      const email = String(req.user?.email || "")
        .trim()
        .toLowerCase();
      const isAdmin = role === "admin" || (email && allowlist.includes(email));

      if (!isAdmin) return res.status(403).json({ error: "Forbidden" });
      next();
    });

  // ---- safety: ensure audit table exists (idempotent) ----
  function ensureSchema() {
    try {
      db.prepare(
        `
        CREATE TABLE IF NOT EXISTS subscriptions_history (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id TEXT NOT NULL,
          event TEXT NOT NULL,                   -- 'approve' | 'reject' | 'sweep_finalize'
          from_status TEXT,
          to_status TEXT,
          from_plan TEXT,
          to_plan TEXT,
          purchased_plan TEXT,
          actor TEXT,
          reason TEXT,
          at TEXT NOT NULL
        )
      `
      ).run();
    } catch (e) {
      console.warn(
        "[admin.subscriptions.sweep] ensureSchema:",
        e?.message || e
      );
    }
  }
  ensureSchema();

  function audit({
    userId,
    event,
    from_status,
    to_status,
    from_plan,
    to_plan,
    purchased_plan,
    actor,
    reason,
  }) {
    db.prepare(
      `INSERT INTO subscriptions_history
         (user_id, event,
          from_status, to_status,
          from_plan, to_plan,
          purchased_plan, actor, reason, at)
       VALUES
         (@userId, @event,
          @from_status, @to_status,
          @from_plan, @to_plan,
          @purchased_plan, @actor, @reason, @at)`
    ).run({
      userId,
      event,
      from_status,
      to_status,
      from_plan,
      to_plan,
      purchased_plan: purchased_plan ?? null,
      actor,
      reason: reason || null,
      at: new Date().toISOString(),
    });
  }

  function nowISO() {
    return new Date().toISOString();
  }

  function findDue(nowIso) {
    // ISO compare works lexicographically for UTC timestamps in SQLite
    return db
      .prepare(
        `
        SELECT user_id, plan, subscription_status, plan_update_at, plan_updated_at
          FROM tradesmen
         WHERE subscription_status = 'canceled_pending'
           AND (
                (plan_update_at  IS NOT NULL AND plan_update_at  <= @now)
             OR (plan_updated_at IS NOT NULL AND plan_updated_at <= @now)
           )
        `
      )
      .all({ now: nowIso });
  }

  function latestPendingGoldSub(uid) {
    return db
      .prepare(
        `
        SELECT id, status, plan_id, created_at
          FROM payments_subscription
         WHERE buyer_uid = @uid
           AND plan_id = 'gold'
           AND status = 'canceled_pending'
         ORDER BY created_at DESC
         LIMIT 1
        `
      )
      .get({ uid });
  }

  function finalizeUser(uid, before, nowIso) {
    // Flip latest pending sub (if present) to canceled
    const sub = latestPendingGoldSub(uid);
    if (sub) {
      db.prepare(
        `UPDATE payments_subscription SET status = 'canceled' WHERE id = @id`
      ).run({ id: sub.id });
    }

    // Downgrade to free + mark status 'canceled'
    db.prepare(
      `
      UPDATE tradesmen
         SET plan                = 'free',
             purchased_plan      = NULL,
             subscription_status = 'canceled',
             plan_update_at      = NULL,
             plan_updated_at     = @now
       WHERE user_id = @uid
    `
    ).run({ uid, now: nowIso });

    // Audit
    audit({
      userId: uid,
      event: "sweep_finalize",
      from_status: before.subscription_status || null,
      to_status: "canceled",
      from_plan: before.plan || null,
      to_plan: "free",
      purchased_plan: null,
      actor: "admin_sweep",
      reason: "auto finalize at period end",
    });

    return {
      user_id: uid,
      subscription_id: sub?.id || null,
      finalized_at: nowIso,
    };
  }

  function simulateFinalizeUser(uid) {
    const sub = latestPendingGoldSub(uid);
    return { user_id: uid, subscription_id: sub?.id || null, simulated: true };
  }

  // ---- handler (admin-only) ----
  function handleSweep(req, res) {
    const nowIso = nowISO();
    const dryRun = !!req.body?.dryRun;
    const actor = req.user?.email || req.user?.uid || "admin";

    // wrap in a single transaction for consistency
    try {
      const due = findDue(nowIso);
      if (!Array.isArray(due) || due.length === 0) {
        return res.json({ ok: true, processed: 0, users: [] });
      }

      if (dryRun) {
        const simulated = due.map((row) => simulateFinalizeUser(row.user_id));
        return res.json({
          ok: true,
          dryRun: true,
          would_process: simulated.length,
          users: simulated,
        });
      }

      db.exec("BEGIN");
      const processed = [];
      for (const row of due) {
        processed.push(finalizeUser(row.user_id, row, nowIso));
      }
      db.exec("COMMIT");

      // best-effort SSE notifications (optional)
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
      } catch (_) {}

      return res.json({
        ok: true,
        processed: processed.length,
        users: processed,
      });
    } catch (e) {
      try {
        db.exec("ROLLBACK");
      } catch (_) {}
      return res
        .status(500)
        .json({ error: "internal_error", details: e?.message || String(e) });
    }
  }

  // ---- routes (admin-guarded) ----
  router.post("/admin/subscriptions/sweep", auth, requireAdmin, handleSweep);
  router.post(
    "/admin/tradesmen/subscriptions/sweep",
    auth,
    requireAdmin,
    handleSweep
  );

  if (!ctx.__logged_admin_subscription_sweep) {
    ctx.__logged_admin_subscription_sweep = true;
    const base = ctx.API_PREFIX || "/api";
    console.log(
      `[routes] mounted: POST ${base}/admin/subscriptions/sweep (and alias /admin/tradesmen/subscriptions/sweep)`
    );
  }
};
