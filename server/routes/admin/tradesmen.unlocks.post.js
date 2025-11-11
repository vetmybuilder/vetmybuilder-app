// server/routes/admin/tradesmen.unlocks.post.js
//
// Admin endpoints to approve/reject one-off contact unlocks (per project).
// POST /api/admin/tradesmen/:uid/unlocks/approve { projectId? }
// POST /api/admin/tradesmen/:uid/unlocks/reject  { projectId? }
//
// If projectId is missing/invalid, we auto-pick the most recent PENDING unlock.
// Requires admin role.

module.exports = (router, ctx) => {
  const { db, auth } = ctx;
  if (!db) throw new Error("db not attached to ctx");

  const API_BASE = ctx.API_PREFIX || "/api";

  function isAdmin(req) {
    const uid = req.user?.uid;
    if (!uid) return false;
    const roleRow =
      db.prepare(`SELECT role FROM user_roles WHERE uid=?`).get(uid) || null;
    const role = String(roleRow?.role || "user").toLowerCase();
    const allowlist = (process.env.ADMIN_EMAILS || "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    const email = String(req.user?.email || "")
      .trim()
      .toLowerCase();
    return role === "admin" || (email && allowlist.includes(email));
  }

  // ---- migrate/ensure table + columns exist ----
  function colSet(name) {
    try {
      return new Set(
        db
          .prepare(`PRAGMA table_info(${name})`)
          .all()
          .map((r) => r.name)
      );
    } catch {
      return new Set();
    }
  }
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
        status      TEXT    NOT NULL DEFAULT 'pending', -- 'pending' | 'approved' | 'rejected'
        created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
        approved_at TEXT,
        UNIQUE (project_id, buyer_uid)
      )
    `
    ).run();
    const cols = colSet("project_contact_unlocks");
    if (!cols.has("approved_at")) {
      db.prepare(
        `ALTER TABLE project_contact_unlocks ADD COLUMN approved_at TEXT`
      ).run();
    }
    if (!cols.has("currency")) {
      db.prepare(
        `ALTER TABLE project_contact_unlocks ADD COLUMN currency TEXT NOT NULL DEFAULT 'gbp'`
      ).run();
    }
    if (!cols.has("amount")) {
      db.prepare(
        `ALTER TABLE project_contact_unlocks ADD COLUMN amount INTEGER NOT NULL DEFAULT 0`
      ).run();
    }
    if (!cols.has("session_id")) {
      db.prepare(
        `ALTER TABLE project_contact_unlocks ADD COLUMN session_id TEXT`
      ).run();
    }
    if (!cols.has("payment_intent")) {
      db.prepare(
        `ALTER TABLE project_contact_unlocks ADD COLUMN payment_intent TEXT`
      ).run();
    }
  }
  ensureUnlocksTable();

  function latestPendingFor(buyerUid) {
    return (
      db
        .prepare(
          `
          SELECT id, project_id, status
            FROM project_contact_unlocks
           WHERE buyer_uid = ? AND LOWER(COALESCE(status,'')) = 'pending'
           ORDER BY datetime(COALESCE(approved_at, created_at)) DESC, id DESC
           LIMIT 1
        `
        )
        .get(buyerUid) || null
    );
  }

  function handle(action) {
    return (req, res) => {
      try {
        if (!isAdmin(req)) {
          return res
            .status(403)
            .json({ error: "forbidden", details: "admin role required" });
        }

        const buyerUid = String(req.params.uid || "");
        if (!buyerUid) return res.status(400).json({ error: "missing_uid" });

        // Accept optional projectId; if absent/invalid, auto-pick most recent pending
        let projectId = Number(req.body?.projectId);
        if (!Number.isFinite(projectId) || projectId <= 0) {
          const pending = latestPendingFor(buyerUid);
          if (!pending)
            return res
              .status(404)
              .json({
                error: "no_pending_unlock",
                details: "No pending unlocks found for this user",
              });
          projectId = Number(pending.project_id);
        }

        // fetch the row we are going to mutate (must exist)
        const existing = db
          .prepare(
            `SELECT id, project_id, status
               FROM project_contact_unlocks
              WHERE buyer_uid = ? AND project_id = ?
              LIMIT 1`
          )
          .get(buyerUid, projectId);

        if (!existing)
          return res
            .status(404)
            .json({
              error: "unlock_not_found",
              details: "No matching unlock row",
            });

        if (action === "approve") {
          db.prepare(
            `UPDATE project_contact_unlocks
               SET status='approved',
                   approved_at = datetime('now')
             WHERE id = ?`
          ).run(existing.id);
        } else if (action === "reject") {
          db.prepare(
            `UPDATE project_contact_unlocks
               SET status='rejected',
                   approved_at = NULL
             WHERE id = ?`
          ).run(existing.id);
        }

        return res.json({
          ok: true,
          buyerUid,
          projectId,
          status: action === "approve" ? "approved" : "rejected",
        });
      } catch (e) {
        return res
          .status(500)
          .json({ error: "server_error", details: e?.message || String(e) });
      }
    };
  }

  router.post("/admin/tradesmen/:uid/unlocks/approve", auth, handle("approve"));
  router.post("/admin/tradesmen/:uid/unlocks/reject", auth, handle("reject"));

  if (!ctx.__logged_admin_unlocks_post) {
    ctx.__logged_admin_unlocks_post = true;
    console.log(
      `[routes] mounted: POST ${API_BASE}/admin/tradesmen/:uid/unlocks/{approve|reject}`
    );
  }
};
