// server/routes/projects/owner-contact.get.js
//
// GET /api/projects/:id/owner-contact
// Returns the project owner's contact details for eligible viewers.
//
// Entitlement (any one of):
//   - Tradesman has an **active Gold subscription**
//     (tradesmen.subscription_status = 'active' AND plan = 'gold')
//   - One-off unlock exists in project_contact_unlocks for (project_id, buyer_uid)
//     AND status = 'approved'

module.exports = (router, ctx) => {
  const { db, auth } = ctx;
  if (!db) throw new Error("db not attached to ctx");
  const TAG = "[projects/owner-contact.get]";

  // Ensure unlocks table exists (idempotent)
  db.prepare(
    `
    CREATE TABLE IF NOT EXISTS project_contact_unlocks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      buyer_uid  TEXT    NOT NULL,
      payment_intent TEXT,
      session_id  TEXT,
      amount      INTEGER NOT NULL DEFAULT 0, -- pence
      currency    TEXT    NOT NULL DEFAULT 'gbp',
      status      TEXT    NOT NULL DEFAULT 'pending', -- 'pending' | 'approved' | 'rejected'
      created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
      UNIQUE (project_id, buyer_uid)
    )
  `
  ).run();

  function tradesmenHasColumn(col) {
    try {
      const rows = db.prepare(`PRAGMA table_info(tradesmen)`).all();
      return rows.some(
        (r) => String(r.name || "").toLowerCase() === col.toLowerCase()
      );
    } catch {
      return false;
    }
  }

  // Fetch viewer's plan/subscription info
  const getPlanInfo = (uid) => {
    const hasPurchasedPlanCol = tradesmenHasColumn("purchased_plan");

    const sql = hasPurchasedPlanCol
      ? `SELECT
            COALESCE(subscription_status,'inactive') AS subscription_status,
            LOWER(COALESCE(plan,'free'))            AS plan_id,
            LOWER(COALESCE(purchased_plan,''))      AS purchased_plan_id
         FROM tradesmen
         WHERE user_id = ?`
      : `SELECT
            COALESCE(subscription_status,'inactive') AS subscription_status,
            LOWER(COALESCE(plan,'free'))            AS plan_id
         FROM tradesmen
         WHERE user_id = ?`;

    const row = db.prepare(sql).get(uid) || null;
    if (!row) {
      return {
        subscriptionStatus: "inactive",
        planId: "free",
        purchasedPlanId: "",
      };
    }

    return {
      subscriptionStatus: String(
        row.subscription_status || "inactive"
      ).toLowerCase(),
      planId: String(row.plan_id || "free").toLowerCase(),
      purchasedPlanId: String(row.purchased_plan_id || "").toLowerCase(),
    };
  };

  // return status for a user->project unlock row if present
  const getOneOffUnlockStatus = (projectId, uid) => {
    const row = db
      .prepare(
        `SELECT status
           FROM project_contact_unlocks
          WHERE project_id = ? AND buyer_uid = ?
          LIMIT 1`
      )
      .get(Number(projectId), String(uid));
    return row ? String(row.status || "").toLowerCase() : null;
  };

  router.get("/projects/:id/owner-contact", auth, (req, res) => {
    try {
      const viewerUid = req.user?.uid;
      if (!viewerUid) return res.status(401).json({ error: "Unauthorized" });

      const pid = Number(req.params.id);
      if (!Number.isFinite(pid) || pid <= 0) {
        return res.status(400).json({ error: "Invalid project ID" });
      }

      // Load minimal project info
      const project =
        db
          .prepare(
            `SELECT id, ownerUserId, LOWER(COALESCE(status,'')) AS status
               FROM projects
              WHERE id = ?`
          )
          .get(pid) || null;

      if (!project) return res.status(404).json({ error: "Project not found" });

      // Only reveal for live projects
      if (project.status && project.status !== "live") {
        return res
          .status(403)
          .json({ error: "Contact not available for this project" });
      }

      // Owner cannot request their own contact
      if (project.ownerUserId === viewerUid) {
        return res
          .status(400)
          .json({ error: "Owner cannot request own contact" });
      }

      // === PLAN + UNLOCK ENTITLEMENT LOGIC ===

      const planInfo = getPlanInfo(viewerUid);
      const { subscriptionStatus, planId } = planInfo;

      // 1) Global entitlement: Active Gold subscription
      const hasGlobalContact =
        subscriptionStatus === "active" && planId === "gold";

      // 2) Per-project entitlement: one-off unlock with status 'approved'
      const unlockStatus = getOneOffUnlockStatus(pid, viewerUid);
      const hasApprovedUnlock = unlockStatus === "approved";

      // If no global entitlement and no approved per-project unlock, block.
      if (!hasGlobalContact && !hasApprovedUnlock) {
        if (!unlockStatus) {
          // No per-project unlock row at all
          return res.status(403).json({ error: "not_unlocked" });
        }
        // There *is* a row, but it's not approved yet -> admin review pending
        return res.status(403).json({ error: "pending_admin_review" });
      }

      // Contact strictly from `users`
      const owner =
        db
          .prepare(
            `SELECT firstName AS firstName,
                    lastName  AS lastName,
                    email     AS email
               FROM users
              WHERE uid = ?`
          )
          .get(project.ownerUserId) || null;

      if (!owner) {
        return res.status(404).json({ error: "Owner not found" });
      }

      const { firstName = null, lastName = null, email = null } = owner;

      return res.json({
        ok: true,
        firstName,
        lastName,
        email,
        owner: { firstName, lastName, email }, // backward compatibility
        entitlement: {
          hasGlobalContact,
          oneOffUnlock: hasApprovedUnlock,
          oneOffStatus: unlockStatus || null,
          subscriptionStatus,
          planId,
        },
      });
    } catch (e) {
      console.error(`${TAG} error:`, e);
      return res
        .status(500)
        .json({ error: e?.message || "Failed to load owner contact" });
    }
  });
};
