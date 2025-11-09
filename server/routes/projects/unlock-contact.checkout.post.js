// server/routes/projects/unlock-contact.checkout.post.js
//
// POST /api/projects/:id/unlock-contact/checkout
// Auth: tradesman required
// Creates a mock checkout *session* to unlock THIS project's owner contact.
// Returns { ok, sessionId, url } where url is the hosted mock checkout page.

module.exports = (router, ctx) => {
  const { auth, db, payments } = ctx;
  if (!db) throw new Error("db not attached to ctx");
  if (!payments) throw new Error("payments not attached to ctx");

  router.post("/projects/:id/unlock-contact/checkout", auth, async (req, res) => {
    try {
      const uid = req.user?.uid;
      if (!uid) return res.status(401).json({ error: "Unauthorized" });

      // Must be a registered tradesman
      const actor =
        db
          .prepare(
            `SELECT user_id FROM tradesmen WHERE user_id = ?`
          )
          .get(uid) || null;
      if (!actor) {
        return res
          .status(403)
          .json({ error: "Only registered tradesmen can purchase unlocks" });
      }

      // Validate project
      const pid = Number(req.params.id);
      if (!Number.isFinite(pid) || pid <= 0) {
        return res.status(400).json({ error: "Invalid project ID" });
      }
      const project = db
        .prepare(`SELECT id, status FROM projects WHERE id = ?`)
        .get(pid);
      if (!project) return res.status(404).json({ error: "Project not found" });

      const status = String(project.status || "").toLowerCase();
      if (status !== "live") {
        return res
          .status(400)
          .json({ error: "Only live projects can be unlocked" });
      }

      // If already unlocked, short-circuit (paid rows live in project_contact_unlocks)
      db.prepare(`
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
        )`).run();

      const existing = db
        .prepare(
          `SELECT 1 FROM project_contact_unlocks
           WHERE project_id = ? AND buyer_uid = ? AND status = 'paid' LIMIT 1`
        )
        .get(pid, uid);
      if (existing) {
        return res.json({
          ok: true,
          alreadyUnlocked: true,
          message: "Contact already unlocked for this project",
        });
      }

      // Pricing
      const unitAmount =
        Number(process.env.ONEOFF_UNLOCK_PRICE_PENCE) > 0
          ? Number(process.env.ONEOFF_UNLOCK_PRICE_PENCE)
          : 299; // £2.99 default
      const productName =
        process.env.ONEOFF_UNLOCK_PRODUCT_NAME || "Unlock homeowner contact";

      // Create a mock checkout session (attach rich metadata for reconciliation)
      const session = await payments.createSession({
        userId: uid,
        items: [
          {
            label: `${productName} · Project #${pid}`,
            price: { amount: unitAmount, currency: "GBP" },
            quantity: 1,
          },
        ],
        // Let the mock driver auto-generate success/cancel URLs with ?session_id=
        metadata: {
          type: "unlock_contact",
          vmb_type: "unlock_contact",
          projectId: String(pid),
          vmb_project_id: String(pid),
          buyerUid: uid,
        },
        ttlSeconds: 15 * 60,
      });

      return res.json({
        ok: true,
        sessionId: session.id,
        url: session.hosted_url, // e.g. /payments/mock/checkout/:id
      });
    } catch (e) {
      console.error("[unlock-contact.checkout.post] error:", e);
      return res
        .status(500)
        .json({ error: e?.message || "Failed to create checkout session" });
    }
  });
};