// server/routes/projects/owner-contact.get.js
//
// GET /api/projects/:id/owner-contact
// Returns the project owner's contact details for eligible viewers.
//
// Entitlement (any one of):
//   - Tradesman has an ACTIVE subscription where plan != 'free'
//   - One-off purchase exists in project_contact_unlocks for (project_id, buyer_uid)
//
// Contact is read **only** from `users` (firstName, lastName, email).

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
      status      TEXT    NOT NULL DEFAULT 'paid', -- 'paid' | 'refunded' | etc.
      created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
      UNIQUE (project_id, buyer_uid)
    )
  `
  ).run();

  const hasActivePaidPlan = (uid) => {
    const r =
      db
        .prepare(
          `SELECT COALESCE(subscription_status,'inactive') AS s,
                  LOWER(COALESCE(plan,'free')) AS p
             FROM tradesmen
            WHERE user_id = ?`
        )
        .get(uid) || null;
    return (
      !!r && String(r.s).toLowerCase() === "active" && String(r.p) !== "free"
    );
  };

  const hasOneOffUnlock = (projectId, uid) => {
    const row = db
      .prepare(
        `SELECT 1
           FROM project_contact_unlocks
          WHERE project_id = ? AND buyer_uid = ? AND status = 'paid'
          LIMIT 1`
      )
      .get(Number(projectId), String(uid));
    return !!row;
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

      // Optional: only reveal for live projects
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

      // Compute entitlement once
      const paidPlan = hasActivePaidPlan(viewerUid);
      const oneOff = hasOneOffUnlock(pid, viewerUid);
      const entitled = paidPlan || oneOff;

      if (!entitled) {
        return res.status(403).json({
          error: "Contact details restricted (no active plan or unlock)",
        });
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
        owner: { firstName, lastName, email }, // keep backward compatibility
        entitlement: { paidPlan, oneOffUnlock: oneOff },
      });
    } catch (e) {
      console.error(`${TAG} error:`, e);
      return res
        .status(500)
        .json({ error: e?.message || "Failed to load owner contact" });
    }
  });
};
