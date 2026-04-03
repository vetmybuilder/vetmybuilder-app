/**
 * GET /api/auth/check-username?username=xxx
 * Returns: { ok: true, available: boolean }
 * No auth required — called during registration before Firebase user creation.
 */
const { logger, withRequest } = require("../../lib/logger");

module.exports = (router, ctx) => {
  const { mysqlQuery } = ctx;

  router.get("/auth/check-username", async (req, res) => {
    const log = withRequest(req).child({ route: "auth.check-username" });

    try {
      const username = String(req.query?.username || "").trim();

      if (!username) {
        return res.status(400).json({ ok: false, error: "username required" });
      }

      const rows = await mysqlQuery(
        "SELECT 1 FROM users WHERE username = ? LIMIT 1",
        [username],
      );

      const available = rows.length === 0;

      log.info({ username, available }, "username availability check");

      return res.json({ ok: true, available });
    } catch (e) {
      log.error({ err: e?.message }, "error in check-username");
      return res.status(500).json({ ok: false, error: "internal_error" });
    }
  });
};
