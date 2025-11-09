// Supports BOTH:
//   POST /api/payments/mock/:id/pay
//   POST /api/payments/mock/pay   { sessionId, card? }
//
// - Always marks the in-memory mock session paid.
// - If metadata.type === 'unlock_contact':
//     * grants entitlement in project_contact_unlocks
//     * flips payments_oneoff PENDING -> SUCCEEDED
// - If metadata.type === 'subscription' (or metadata.planId present):
//     * flips payments_subscription PENDING -> SUCCEEDED
//     * updates tradesmen workflow (draft/free + purchased_plan) and audit row

module.exports = (router, ctx) => {
  const { auth, payments, db } = ctx;
  if (!payments) throw new Error("payments not attached to ctx");
  if (!db) throw new Error("db not attached to ctx");

  function ensureUnlocksTable() {
    db.prepare(
      `
      CREATE TABLE IF NOT EXISTS project_contact_unlocks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER NOT NULL,
        buyer_uid  TEXT    NOT NULL,
        payment_intent TEXT,
        session_id  TEXT,
        amount      INTEGER NOT NULL DEFAULT 0,
        currency    TEXT    NOT NULL DEFAULT 'gbp',
        status      TEXT    NOT NULL DEFAULT 'paid',
        created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
        UNIQUE (project_id, buyer_uid)
      )
    `
    ).run();
  }

  function ensureOneOffTable() {
    db.prepare(
      `
      CREATE TABLE IF NOT EXISTS payments_oneoff (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        type TEXT NOT NULL,
        entity_id INTEGER,
        amount INTEGER NOT NULL,
        currency TEXT NOT NULL DEFAULT 'GBP',
        status TEXT NOT NULL DEFAULT 'pending',
        provider_session_id TEXT,
        provider_payment_intent TEXT,
        expires_at DATETIME,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `
    ).run();
    db.prepare(
      `
      CREATE INDEX IF NOT EXISTS idx_oneoff_user_type_entity
        ON payments_oneoff (user_id, type, entity_id, status)
    `
    ).run();
  }

  function ensureSubscriptionsTable() {
    db.prepare(
      `
      CREATE TABLE IF NOT EXISTS payments_subscription (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        buyer_uid TEXT NOT NULL,
        plan_id   TEXT NOT NULL,
        amount    INTEGER NOT NULL,
        currency  TEXT NOT NULL DEFAULT 'GBP',
        status    TEXT NOT NULL DEFAULT 'pending',
        provider_session_id      TEXT UNIQUE,
        provider_customer_id     TEXT,
        provider_subscription_id TEXT,
        provider_payment_intent  TEXT,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `
    ).run();
  }

  function computeTotalFromItems(items = []) {
    let p = 0;
    let c = "gbp";
    for (const it of items) {
      const qty = Number.isFinite(it.quantity) ? it.quantity : 1;
      const amt = Number(it?.price?.amount || 0);
      p += amt * qty;
      c = (it?.price?.currency || c || "gbp").toLowerCase();
    }
    return { amount: p, currency: c || "gbp" };
  }

  async function handle(req, res) {
    try {
      const uid = req.user?.uid;
      if (!uid) return res.status(401).json({ error: "Unauthorized" });

      const id = req.params?.id || req.body?.sessionId;
      if (!id) return res.status(400).json({ error: "sessionId required" });

      const s = payments.getSession(id);
      if (!s) return res.status(404).json({ error: "Not found" });
      if (s.userId !== uid) return res.status(403).json({ error: "Forbidden" });

      const updated = payments.markPaid(id);

      const md = { ...(s?.metadata || {}), ...(updated?.metadata || {}) };
      const typ = String(md.type || md.kind || md.vmb_type || "").toLowerCase();

      // ---------- ONE-OFF: unlock_contact ----------
      if (typ === "unlock_contact") {
        const projectId = Number(
          md.projectId || md.project_id || md.vmb_project_id
        );
        if (!Number.isFinite(projectId) || projectId <= 0) {
          return res
            .status(400)
            .json({ error: "Missing/invalid projectId for unlock_contact" });
        }

        const total =
          updated?.total ||
          s?.total ||
          computeTotalFromItems(updated?.items || s?.items || []);
        const amount = Number(total?.amount || 0);
        const currency = String(total?.currency || "gbp").toLowerCase();

        ensureUnlocksTable();
        db.prepare(
          `
          INSERT INTO project_contact_unlocks
            (project_id, buyer_uid, payment_intent, session_id, amount, currency, status)
          VALUES (?, ?, NULL, ?, ?, ?, 'paid')
          ON CONFLICT(project_id, buyer_uid) DO UPDATE SET
            session_id = excluded.session_id,
            amount     = CASE WHEN excluded.amount > 0 THEN excluded.amount ELSE project_contact_unlocks.amount END,
            currency   = COALESCE(excluded.currency, project_contact_unlocks.currency),
            status     = 'paid'
        `
        ).run(projectId, uid, updated.id, amount, currency);

        ensureOneOffTable();
        db.prepare(
          `
          UPDATE payments_oneoff
             SET status = 'succeeded',
                 provider_session_id = COALESCE(provider_session_id, @sid),
                 provider_payment_intent = COALESCE(provider_payment_intent, 'mock:' || @sid)
           WHERE user_id = @uid
             AND type = 'unlock_contact'
             AND entity_id = @pid
             AND status = 'pending'
        `
        ).run({ uid, pid: projectId, sid: updated.id });

        return res
          .status(200)
          .json({ ok: true, session: updated, oneOff: { projectId } });
      }

      // ---------- SUBSCRIPTION ----------
      if (typ === "subscription" || md.planId || md.plan_id) {
        const planId =
          String(md.planId || md.plan_id || "").toLowerCase() || "gold";

        ensureSubscriptionsTable();
        db.prepare(
          `
          UPDATE payments_subscription
             SET status = 'succeeded',
                 provider_payment_intent = COALESCE(provider_payment_intent, 'mock:' || @sid)
           WHERE provider_session_id = @sid
        `
        ).run({ sid: updated.id });

        // Persist workflow on tradesmen (draft/free + purchased_plan + audit)
        try {
          db.exec("BEGIN");

          const prior =
            db
              .prepare(
                `SELECT subscription_status AS status, plan
                   FROM tradesmen
                  WHERE user_id = ?`
              )
              .get(uid) || {};

          db.prepare(
            `
            UPDATE tradesmen
               SET subscription_status = 'draft',
                   plan                = 'free',
                   plan_update_at      = NULL,
                   purchased_plan      = COALESCE(@purchasedPlan, purchased_plan),
                   updated_at          = @now
             WHERE user_id = @uid
          `
          ).run({
            uid,
            purchasedPlan: planId,
            now: new Date().toISOString(),
          });

          db.prepare(
            `
            INSERT INTO subscriptions_history
              (user_id, event,
               from_status, to_status,
               from_plan,   to_plan,
               purchased_plan, actor, reason, at)
            VALUES
              (@uid, 'purchase',
               @from_status, 'draft',
               @from_plan,   'free',
               @purchased_plan, 'system', NULL, @at)
          `
          ).run({
            uid,
            from_status: prior.status ?? null,
            from_plan: prior.plan ?? null,
            purchased_plan: planId,
            at: new Date().toISOString(),
          });

          db.exec("COMMIT");
        } catch (e) {
          try {
            db.exec("ROLLBACK");
          } catch {}
          console.warn(
            "[payments.mock.pay] subscription persist warning:",
            e?.message || e
          );
        }

        return res
          .status(200)
          .json({ ok: true, session: updated, subscription: { planId } });
      }

      // ---------- default ----------
      return res.status(200).json({ ok: true, session: updated });
    } catch (e) {
      return res
        .status(500)
        .json({ error: e?.message || "Failed to mark paid" });
    }
  }

  router.post("/payments/mock/:id/pay", auth, handle);
  router.post("/payments/mock/pay", auth, handle);
};
