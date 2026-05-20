// server/routes/auth/role-intent.post.js
//
// POST /api/auth/role-intent
// Body: { role: "tradesman" | "homeowner" }
//
// Pre-launch we need to track who has *started* a trader signup, even
// if they abandon mid-wizard. Without this the admin user list shows
// every Firebase-authed user as a homeowner (the absence-of-tradesman
// fallback), which is misleading and breaks supply-side analytics.
//
// This route is called by the trader signup pages immediately after the
// user authenticates (email/password or OAuth), to declare intent. We
// write a `user_roles` row keyed by uid. Role escalation is one-way
// safe:
//   - never overwrites an existing "admin" role
//   - never downgrades a confirmed "tradesman" back to "homeowner"
//   - the homeowner path is mostly there for symmetry; in practice
//     homeowner users get the role stamped at /signup/complete

module.exports = (router, ctx) => {
  const { auth, mysqlQuery } = ctx;
  const log = ctx.log || console;
  const TAG = "[auth/role-intent.post]";

  if (!mysqlQuery) throw new Error("mysqlQuery not attached to ctx");

  router.post("/auth/role-intent", auth, async (req, res) => {
    const uid = req.user?.uid;
    if (!uid) return res.status(401).json({ ok: false, error: "Unauthorized" });

    const raw = String(req.body?.role || "").toLowerCase();
    const role =
      raw === "tradesman" || raw === "tradesperson" || raw === "tradesmen"
        ? "tradesman"
        : raw === "homeowner" || raw === "user"
          ? "homeowner"
          : null;

    if (!role) {
      return res.status(400).json({ ok: false, error: "invalid_role" });
    }

    try {
      const existing = await mysqlQuery(
        `SELECT role FROM user_roles WHERE uid = ? LIMIT 1`,
        [uid],
      );
      const current = existing[0]?.role
        ? String(existing[0].role).toLowerCase()
        : null;

      // Never downgrade admin or an already-stamped tradesman.
      if (current === "admin") {
        return res.json({ ok: true, role: "admin", changed: false });
      }
      if (current === "tradesman" && role !== "tradesman") {
        return res.json({ ok: true, role: "tradesman", changed: false });
      }

      // First-time stamp OR upgrade homeowner -> tradesman.
      if (current !== role) {
        await mysqlQuery(
          `
          INSERT INTO user_roles (uid, role)
          VALUES (?, ?)
          ON DUPLICATE KEY UPDATE role = VALUES(role)
          `,
          [uid, role],
        );
        log.info?.(`${TAG} stamped role`, { uid, from: current, to: role });
      }

      return res.json({ ok: true, role, changed: current !== role });
    } catch (e) {
      log.error?.({ error: e?.message }, `${TAG} failed`);
      return res.status(500).json({ ok: false, error: "server_error" });
    }
  });
};
