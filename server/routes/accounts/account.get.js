/**
 * GET /api/account
 * Auth: required (Bearer). Also runs touchUser to upsert the user row.
 *
 * Default (no query): { user, profile }
 *
 * Minimal mode (?minimal=1&uid=...)
 *  - Allowed: self, admin, tradesman with ACTIVE paid plan
 */
const { logger, withRequest } = require("../../lib/logger");

module.exports = (router, ctx) => {
  const { auth, touchUserMw, mysqlQuery } = ctx;

  async function isAdmin(req) {
    if (!req.user) return false;
    try {
      const roleRows = await mysqlQuery(
        "SELECT role FROM user_roles WHERE uid = ?",
        [req.user.uid]
      );

      const row = roleRows[0] || null;
      const role = String(row?.role || "user").toLowerCase();
      if (role === "admin") return true;

      const allowlist = (process.env.ADMIN_EMAILS || "")
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);

      const email = String(req.user?.email || "")
        .trim()
        .toLowerCase();

      return email && allowlist.includes(email);
    } catch {
      return false;
    }
  }

  /** Is the requester a tradesman with an ACTIVE non-free subscription? */
  async function hasActivePaidPlan(uid) {
    try {
      const rows = await mysqlQuery(
        `SELECT COALESCE(subscription_status,'inactive') AS s,
                LOWER(COALESCE(plan,'free')) AS p
           FROM tradesmen
          WHERE user_id = ?`,
        [uid]
      );
      const r = rows[0] || null;
      if (!r) return false;
      return String(r.s) === "active" && String(r.p) !== "free";
    } catch {
      return false;
    }
  }

  router.get("/account", auth, touchUserMw, async (req, res) => {
    const log = withRequest(req);
    const requesterUid = req.user.uid;

    const minimal = String(req.query.minimal || "").toLowerCase() === "1";
    const targetUid = String(req.query.uid || requesterUid);

    if (minimal) {
      try {
        const sameUser = targetUid === requesterUid;
        const admin = await isAdmin(req);
        const activePaid = await hasActivePaidPlan(requesterUid);

        if (log.debugEnabled) {
          log.debug(
            {
              sameUser,
              admin,
              activePaid,
              targetUid,
              requesterUid,
            },
            "minimal account access check"
          );
        }

        if (!sameUser && !admin && !activePaid) {
          return res.status(403).json({ error: "forbidden" });
        }

        const userRows = await mysqlQuery(
          `SELECT uid, firstName, lastName, email
             FROM users
            WHERE uid = ?`,
          [targetUid]
        );
        const user = userRows[0] || null;

        return res.json({ user });
      } catch (err) {
        logger.error(
          {
            err: err?.message,
            requesterUid,
            targetUid,
            query: req.query,
          },
          "Error in GET /api/account (minimal mode)"
        );
        return res.status(500).json({ error: "internal_error" });
      }
    }

    // -------- Full self profile --------
    try {
      const userRows = await mysqlQuery(
        `SELECT uid, email, firstName, lastName, username,
                locationRaw, postcode, postcodeSector,
                postcodeOutward, city
           FROM users
          WHERE uid = ?`,
        [requesterUid]
      );
      const user = userRows[0] || null;

      const profileRows = await mysqlQuery(
        `SELECT uid AS userId, locationRaw, postcode, postcodeSector,
                postcodeOutward, city, createdAt AS updatedAt
           FROM users
          WHERE uid = ?`,
        [requesterUid]
      );
      const profile = profileRows[0] || null;

      return res.json({ user, profile });
    } catch (err) {
      logger.error(
        {
          err: err?.message,
          requesterUid,
        },
        "Error in GET /api/account (full profile)"
      );
      return res.status(500).json({ error: "internal_error" });
    }
  });
};
