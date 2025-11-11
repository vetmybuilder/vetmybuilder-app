// server/routes/admin/subscriptions.cancel.post.js
//
// Admin-only: cancel a user's Gold monthly subscription.
// Default behavior is "cancel at period end" (keeps benefits until created_at + 1 month).
// Optional immediate cancellation with body { immediate: true }.
//
// Routes (both variants supported):
//   POST /admin/subscriptions/:userId/cancel
//   POST /admin/tradesmen/:userId/subscription/cancel
//
// Body (optional): { immediate?: boolean, reason?: string }

module.exports = (router, ctx) => {
  const { db, auth } = ctx;
  if (!db) throw new Error("db not attached to ctx");

  const log = ctx.log || console;

  // ---- admin guard (mirror your pattern) ----
  const requireAdmin =
    ctx.requireAdmin ||
    ((req, res, next) => {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" });

      let roleRow = null;
      try {
        roleRow = db
          .prepare(`SELECT role FROM user_roles WHERE uid=?`)
          .get(req.user.uid);
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
          event TEXT NOT NULL,                   -- 'approve' | 'reject' | 'admin_cancel' | 'admin_cancel_now' | 'sweep_finalize'
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
        "[admin.subscriptions.cancel] ensureSchema:",
        e?.message || e
      );
    }
  }
  ensureSchema();

  /** Snapshot of current tradesmen subscription fields (for audit) */
  function getSnapshot(userId) {
    return (
      db
        .prepare(
          `SELECT subscription_status AS status,
                  plan,
                  purchased_plan,
                  plan_update_at,
                  plan_updated_at
             FROM tradesmen
            WHERE user_id = ?`
        )
        .get(userId) || { status: null, plan: null, purchased_plan: null }
    );
  }

  /** Latest Gold subscription for a user with one of the candidate statuses */
  function getLatestGoldSub(userId, statuses) {
    const placeholders = statuses.map(() => "?").join(",");
    return db
      .prepare(
        `
        SELECT *
          FROM payments_subscription
         WHERE buyer_uid = ?
           AND plan_id = 'gold'
           AND status IN (${placeholders})
         ORDER BY created_at DESC
         LIMIT 1
        `
      )
      .get(userId, ...statuses);
  }

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

  function asIso(d) {
    try {
      return new Date(d).toISOString();
    } catch {
      return new Date().toISOString();
    }
  }
  function addOneMonthISO(iso) {
    const d = new Date(iso || Date.now());
    const m = d.getMonth();
    d.setMonth(m + 1);
    return d.toISOString();
  }

  function handleAdminCancel(req, res) {
    const userId = String(req.params.userId || "");
    const immediate = !!req.body?.immediate;
    const reason = req.body?.reason || null;
    const actor = req.user?.email || req.user?.uid || "admin";
    if (!userId) return res.status(400).json({ error: "userId required" });

    log.info?.("[admin.cancel] request", { userId, immediate, reason, actor });

    const before = getSnapshot(userId);
    if (!before) return res.status(404).json({ error: "User not found" });

    // IMPORTANT: include 'succeeded' as a cancellable state for the mock flow
    const cancellableStatuses = ["succeeded", "active", "trialing", "canceled_pending"];
    const sub = getLatestGoldSub(userId, cancellableStatuses);

    if (!sub) {
      log.info?.("[admin.cancel] no cancellable subscription", { userId });
      return res.status(404).json({
        error: "no_subscription",
        hint: "No Gold subscription found in a cancellable state",
      });
    }

    log.info?.("[admin.cancel] matched subscription", {
      id: sub.id,
      status: sub.status,
      created_at: sub.created_at,
    });

    const nowIso = new Date().toISOString();

    try {
      db.exec("BEGIN");

      let resultPayload = null;

      if (immediate) {
        // Immediate: flip to 'canceled' and downgrade now
        db.prepare(
          `UPDATE payments_subscription SET status = 'canceled' WHERE id = @id`
        ).run({ id: sub.id });

        db.prepare(
          `
          UPDATE tradesmen
             SET plan                = 'free',
                 purchased_plan      = NULL,
                 subscription_status = 'canceled',
                 plan_update_at      = NULL,
                 plan_updated_at     = @now,
                 updated_at          = @now
           WHERE user_id = @uid
        `
        ).run({ uid: userId, now: nowIso });

        audit({
          userId,
          event: "admin_cancel_now",
          from_status: before.status,
          to_status: "canceled",
          from_plan: before.plan,
          to_plan: "free",
          purchased_plan: before.purchased_plan ?? null,
          actor,
          reason,
        });

        resultPayload = {
          ok: true,
          user_id: userId,
          status: "canceled",
          plan: "free",
          immediate: true,
          subscription_id: sub.id,
          canceled_at: nowIso,
        };
      } else {
        // Period-end: mark 'canceled_pending' and keep benefits until cancelAt
        const cancelAtISO =
          (before.plan_update_at && asIso(before.plan_update_at)) ||
          (before.plan_updated_at && asIso(before.plan_updated_at)) ||
          addOneMonthISO(asIso(sub.created_at));

        db.prepare(
          `UPDATE payments_subscription SET status = 'canceled_pending' WHERE id = @id`
        ).run({ id: sub.id });

        db.prepare(
          `
          UPDATE tradesmen
             SET subscription_status = 'canceled_pending',
                 plan_update_at      = @cancelAt,
                 plan_updated_at     = @cancelAt,
                 updated_at          = @now
           WHERE user_id = @uid
        `
        ).run({ uid: userId, cancelAt: cancelAtISO, now: nowIso });

        audit({
          userId,
          event: "admin_cancel",
          from_status: before.status,
          to_status: "canceled_pending",
          from_plan: before.plan,
          to_plan: before.plan || "gold",
          purchased_plan: before.purchased_plan ?? null,
          actor,
          reason,
        });

        resultPayload = {
          ok: true,
          user_id: userId,
          status: "canceled_pending",
          plan: before.plan || "gold",
          cancel_at: cancelAtISO,
          subscription_id: sub.id,
        };
      }

      db.exec("COMMIT");

      try {
        if (typeof ctx.sseSend === "function") {
          ctx.sseSend(userId, { type: "plan.updated", ...resultPayload });
        }
      } catch (_) {}

      return res.json(resultPayload);
    } catch (e) {
      try {
        db.exec("ROLLBACK");
      } catch (_) {}
      return res
        .status(500)
        .json({ error: "internal_error", details: e?.message || String(e) });
    }
  }

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
