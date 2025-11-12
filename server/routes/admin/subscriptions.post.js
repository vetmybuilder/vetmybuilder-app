// server/routes/admin/subscriptions.post.js
//
// Approve / Reject a pending (draft) subscription OR spotlight one-off.
// Routes (both variants supported):
//   POST /admin/subscriptions/:userId/approve
//   POST /admin/subscriptions/:userId/reject
//   POST /admin/tradesmen/:userId/subscription/approve
//   POST /admin/tradesmen/:userId/subscription/reject
//
// Body (optional): { reason?: string, spotlightDays?: number }

module.exports = (router, ctx) => {
  const { db, auth } = ctx;
  if (!db) throw new Error("db not attached to ctx");

  // ---- admin guard (match leaderboard's logic) ----
  const requireAdmin =
    ctx.requireAdmin ||
    ((req, res, next) => {
      if (!req.user) return res.status(401).json({ error: "Unauthorized" });

      const uid = req.user.uid;
      let roleRow = null;
      try {
        roleRow = db.prepare(`SELECT role FROM user_roles WHERE uid=?`).get(uid);
      } catch (_) {}

      const role = String(roleRow?.role || "user").toLowerCase();

      const allowlist = (process.env.ADMIN_EMAILS || "")
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);

      const email = String(req.user?.email || "").trim().toLowerCase();
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
          event TEXT NOT NULL,                   -- 'approve' | 'reject'
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
      console.warn("[admin.subscriptions] ensureSchema:", e?.message || e);
    }
  }
  ensureSchema();

  /** Load current subscription snapshot for audit */
  function getSnapshot(userId) {
    return (
      db
        .prepare(
          `SELECT subscription_status AS status,
                  plan,
                  purchased_plan
             FROM tradesmen
            WHERE user_id = ?`
        )
        .get(userId) || { status: null, plan: null, purchased_plan: null }
    );
  }

  /** Get most recent draft subscription row id for a user & plan (if any) */
  function getLatestDraftSubId(userId, planId) {
    try {
      const row = db
        .prepare(
          `SELECT id
             FROM payments_subscription
            WHERE buyer_uid = ?
              AND plan_id   = ?
              AND status    = 'draft'
            ORDER BY created_at DESC
            LIMIT 1`
        )
        .get(userId, planId);
      return row?.id || null;
    } catch {
      return null;
    }
  }

  /** Get most recent PENDING one-off payment row id for a user & type */
  function getLatestPendingOneOffId(userId, type) {
    try {
      const row = db
        .prepare(
          `SELECT id
             FROM payments_oneoff
            WHERE user_id = ?
              AND type     = ?
              AND status   = 'pending'
            ORDER BY created_at DESC
            LIMIT 1`
        )
        .get(userId, type);
      return row?.id || null;
    } catch {
      return null;
    }
  }

  /** Append audit row */
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
      purchased_plan,
      actor,
      reason: reason || null,
      at: new Date().toISOString(),
    });
  }

  // ---- core ops (shared) ----
  function handleApprove(req, res) {
    const userId = String(req.params.userId || "");
    const reason = req.body?.reason || null;
    const spotlightDays =
      Number.isFinite(req.body?.spotlightDays) && req.body.spotlightDays > 0
        ? Math.floor(req.body.spotlightDays)
        : 30; // default 30 days
    const actor = req.user?.email || req.user?.uid || "admin";

    try {
      const before = getSnapshot(userId);
      if (!before) return res.status(404).json({ error: "Not found" });

      const pending = (before.purchased_plan || "").toLowerCase();
      if (!pending) {
        return res
          .status(400)
          .json({ error: "No purchased_plan to approve for this user" });
      }

      db.exec("BEGIN");
      const nowIso = new Date().toISOString();

      // --- Spotlight one-off approval path ---
      if (pending === "spotlight") {
        const paymentId = getLatestPendingOneOffId(userId, "spotlight");
        if (!paymentId) {
          db.exec("ROLLBACK");
          return res
            .status(400)
            .json({ error: "No pending spotlight one-off payment found" });
        }

        // 1) Activate tradesman spotlight
        db.prepare(
          `UPDATE tradesmen
              SET subscription_status = 'active',
                  plan                = 'spotlight',
                  plan_update_at      = @now,
                  purchased_plan      = NULL,
                  updated_at          = @now
            WHERE user_id = @uid`
        ).run({ uid: userId, now: nowIso });

        // 2) Activate payments_oneoff + set expiry
        const expires = new Date();
        expires.setDate(expires.getDate() + spotlightDays);
        db.prepare(
          `UPDATE payments_oneoff
              SET status = 'active',
                  expires_at = @exp
            WHERE id = @id`
        ).run({ id: paymentId, exp: expires.toISOString() });

        // 3) Audit
        audit({
          userId,
          event: "approve",
          from_status: before.status,
          to_status: "active",
          from_plan: before.plan,
          to_plan: "spotlight",
          purchased_plan: "spotlight",
          actor,
          reason,
        });

        db.exec("COMMIT");
        return res.json({
          ok: true,
          user_id: userId,
          new_status: "active",
          new_plan: "spotlight",
          oneoff_id: paymentId,
          expires_at: expires.toISOString(),
        });
      }

      // --- Subscription approval path (gold, etc.) ---
      // 1) Activate tradesman subscription
      db.prepare(
        `UPDATE tradesmen
            SET subscription_status = 'active',
                plan                = @pending,
                plan_update_at      = @now,
                purchased_plan      = NULL,
                updated_at          = @now
          WHERE user_id = @uid`
      ).run({ uid: userId, pending, now: nowIso });

      // 2) Flip the latest draft subscription for THIS plan -> succeeded
      const subId = getLatestDraftSubId(userId, pending);
      if (subId) {
        db.prepare(
          `UPDATE payments_subscription
              SET status = 'succeeded'
            WHERE id = ?`
        ).run(subId);
      }

      // 3) Audit
      audit({
        userId,
        event: "approve",
        from_status: before.status,
        to_status: "active",
        from_plan: before.plan,
        to_plan: pending,
        purchased_plan: pending,
        actor,
        reason,
      });

      db.exec("COMMIT");
      return res.json({
        ok: true,
        user_id: userId,
        new_status: "active",
        new_plan: pending,
      });
    } catch (e) {
      try {
        db.exec("ROLLBACK");
      } catch (_) {}
      return res.status(500).json({ error: e?.message || "Approve failed" });
    }
  }

  function handleReject(req, res) {
    const userId = String(req.params.userId || "");
    const reason = req.body?.reason || null;
    const actor = req.user?.email || req.user?.uid || "admin";

    try {
      const before = getSnapshot(userId);
      if (!before) return res.status(404).json({ error: "Not found" });

      db.exec("BEGIN");
      const nowIso = new Date().toISOString();
      const pending = (before.purchased_plan || "").toLowerCase();

      // --- Spotlight one-off rejection path ---
      if (pending === "spotlight") {
        const paymentId = getLatestPendingOneOffId(userId, "spotlight");
        if (paymentId) {
          db.prepare(
            `UPDATE payments_oneoff
                SET status = 'rejected',
                    expires_at = NULL
              WHERE id = ?`
          ).run(paymentId);
        }

        // Downgrade tradesman to free + clear pending
        db.prepare(
          `UPDATE tradesmen
              SET subscription_status = 'inactive',
                  plan                = 'free',
                  plan_update_at      = @now,
                  purchased_plan      = NULL,
                  updated_at          = @now
            WHERE user_id = @uid`
        ).run({ uid: userId, now: nowIso });

        audit({
          userId,
          event: "reject",
          from_status: before.status,
          to_status: "inactive",
          from_plan: before.plan,
          to_plan: "free",
          purchased_plan: "spotlight",
          actor,
          reason,
        });

        db.exec("COMMIT");
        return res.json({
          ok: true,
          user_id: userId,
          new_status: "inactive",
          new_plan: "free",
        });
      }

      // --- Subscription rejection path ---
      // Downgrade tradesman to free + clear pending
      db.prepare(
        `UPDATE tradesmen
            SET subscription_status = 'inactive',
                plan                = 'free',
                plan_update_at      = @now,
                purchased_plan      = NULL,
                updated_at          = @now
          WHERE user_id = @uid`
      ).run({ uid: userId, now: nowIso });

      // Mark latest draft subscription for the pending plan -> rejected
      const subId = pending ? getLatestDraftSubId(userId, pending) : null;
      if (subId) {
        db.prepare(
          `UPDATE payments_subscription
              SET status = 'rejected'
            WHERE id = ?`
        ).run(subId);
      }

      audit({
        userId,
        event: "reject",
        from_status: before.status,
        to_status: "inactive",
        from_plan: before.plan,
        to_plan: "free",
        purchased_plan: pending || null,
        actor,
        reason,
      });

      db.exec("COMMIT");
      return res.json({
        ok: true,
        user_id: userId,
        new_status: "inactive",
        new_plan: "free",
      });
    } catch (e) {
      try {
        db.exec("ROLLBACK");
      } catch (_) {}
      return res.status(500).json({ error: e?.message || "Reject failed" });
    }
  }

  // ---- original paths ----
  router.post(
    "/admin/subscriptions/:userId/approve",
    auth,
    requireAdmin,
    handleApprove
  );
  router.post(
    "/admin/subscriptions/:userId/reject",
    auth,
    requireAdmin,
    handleReject
  );

  // ---- UI alias paths ----
  router.post(
    "/admin/tradesmen/:userId/subscription/approve",
    auth,
    requireAdmin,
    handleApprove
  );
  router.post(
    "/admin/tradesmen/:userId/subscription/reject",
    auth,
    requireAdmin,
    handleReject
  );

  if (!ctx.__logged_admin_subscription_routes) {
    ctx.__logged_admin_subscription_routes = true;
    const base = ctx.API_PREFIX || "/api";
    console.log(
      `[routes] mounted: POST ${base}/admin/subscriptions/:userId/approve (and alias /admin/tradesmen/:userId/subscription/approve)`
    );
    console.log(
      `[routes] mounted: POST ${base}/admin/subscriptions/:userId/reject  (and alias /admin/tradesmen/:userId/subscription/reject)`
    );
  }
};